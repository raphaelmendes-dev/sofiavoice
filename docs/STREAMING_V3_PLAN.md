<div align="center">

# 🚀 STREAMING v3.0 — Architecture Plan

[🇺🇸 English (this file)](STREAMING_V3_PLAN.md) · [🇧🇷 Português do Brasil](STREAMING_V3_PLAN.pt-BR.md)

</div>

---

## 📑 Table of Contents

- [1. Current Context (v2.0)](#1-current-context-v20)
- [2. v3.0 Proposal — Bidirectional Streaming](#2-v30-proposal--bidirectional-streaming)
- [3. Challenges & Requirements](#3-challenges--requirements)
- [4. Implementation Requirements (PHASE 17+ checklist)](#4-implementation-requirements-phase-17-checklist)
- [5. Success Criteria](#5-success-criteria)

---

> **Phase:** 16 · **Author:** Rs4Machine · **Status:** Architectural planning (pre-implementation)
> **Goal:** Migrate the synchronous HTTP POST pipeline (Wait-Then-Play) to **bidirectional streaming** (WebSockets + SSE) to reduce perceived latency and enable near-instant TTFB.

---

## 1. Current Context (v2.0)

### 1.1 Current synchronous pipeline — "Wait-Then-Play"

```
Frontend                FastAPI (Render)            Groq Cloud
   │  Records audio (VAD)    │                          │
   ├── POST /api/transcribe ─▶│──▶ Whisper large-v3 ────▶│  (full audio)
   │  { "text": "..." }  ◀────│◀──── text                │
   ├── POST /api/chat ───────▶│──▶ LLaMA (synchronous) ─▶│
   │  { "response": "..." } ◀─│◀──── full response        │
   ├── POST /api/speak ──────▶│──▶ EdgeTTS (BytesIO)     │
   │  { "audio_base64" }  ◀───│◀──── full MP3             │
   └── Plays (Audio.play)     │                          │
```

### 1.2 Current bottleneck (measured)

| Stage | Typical latency | Notes |
|---|---|---|
| STT (Whisper via Groq) | ~0.4–0.7 s | Waits for the **full file**; no partial hypotheses |
| LLM (Groq, synchronous) | ~0.5–0.8 s | Waits for **all tokens** before responding |
| TTS (EdgeTTS → base64) | ~0.3–0.5 s | Accumulates the entire MP3 + base64 encode + transfer |
| **TOTAL perceived** | **~1.3 – 1.8 s** | The user sees NOTHING until everything finishes |

**Root cause of the "bottleneck": it isn't the latency of each model — it's the full-wait pattern (wait-then-play).** Even though Groq responds in ~200 ms, the user perceives the sum of the 3 network round-trips + the 3 serialized base64 payloads + waiting for the complete audio.

### 1.3 Current infrastructure survey

- **Backend:** `backend/main.py` (FastAPI, CORS `*`, router `prefix="/api"`) → `backend/routers/voice.py` (4 REST endpoints) → `backend/services/{stt,llm,tts}.py` (Groq client / EdgeTTS).
- **Frontend:** `frontend/hooks/useSofiaVoice.js` → 3 sequential `fetch` POSTs (`/api/transcribe`, `/api/chat`, `/api/speak`), `metrics` measurement (STT/LLM/TTS/TOTAL), and the HUD in `TerminalLog.jsx`.
- **Deployment:** Render (backend, free tier) · Vercel (frontend, Next.js 15).

---

## 2. v3.0 Proposal — Bidirectional Streaming

### 2.1 Target flow

```
Frontend                WS /ws/audio (FastAPI)      Groq · EdgeTTS
   │  handshake (session_id)  │                          │
   ├── send(binary chunk PCM)─▶│──▶ Whisper streaming ──▶│  (partial hypotheses)
   │  ◀─ STT_PARTIAL (text) ───│◀── hypothesis            │
   ├── send(stt_finalize) ─────▶│──▶ chat stream=True ──▶│
   │  ◀─ llm_token ×N (SSE) ───│◀── tokens               │
   │  ◀─ llm_done ─────────────│                          │
   │  ◀─ tts_chunk ×M (MP3) ───│◀── EdgeTTS per-stream    │
   └── jitter buffer → playback │                          │
```

### 2.2 Layered management

| Layer | Responsibility | Proposed component |
|---|---|---|
| Transport | WebSocket `/ws/audio` (FastAPI `@app.websocket`) + SSE event stream for the LLM | `backend/routers/streaming.py` (NEW) |
| Session management | Connection registry, `connect / receive / disconnect` lifecycle, resource cleanup | `backend/core/connection_manager.py` (NEW) — FastAPI's canonical `ConnectionManager` pattern |
| Streaming STT | Whisper in chunks with partial hypotheses | `STTService.final_chunk()` + `STTService.transcribe_partial()` (EXTEND) |
| Streaming LLM | Async generator `chat_stream()` with `stream=True` from Groq (yield per token) | `LLMService.chat_stream()` (EXTEND — TODO already marked) |
| Streaming TTS | EdgeTTS already produces `chunk["type"]=="audio"` in an `async for` → DO NOT accumulate, emit | `TTSService.synthesize_stream()` (EXTEND) |
| Frontend | WS client with audio (jitter) buffer, SSE token rendering, VAD publishing PCM chunks | `frontend/hooks/useSofiaVoice.js` (REFACTOR) + `frontend/lib/ws_client.js` (NEW) |

### 2.3 Fit map — where each endpoint lands (without breaking REST)

| New route (v3.0) | Method | File | Relationship to legacy REST |
|---|---|---|---|
| `/ws/audio` | WebSocket | `backend/routers/streaming.py` | **Replaces** `/api/voice` (full pipeline) |
| `/api/stream` (optional) | GET SSE (`StreamingResponse`) | `backend/routers/streaming.py` | **Alternative** for environments where the reverse proxy doesn't support WS (Render free tier) |
| `/api/transcribe` | POST (untouched) | `backend/routers/voice.py` | LEGACY — kept for older clients/scripts |
| `/api/chat` | POST (untouched) | `backend/routers/voice.py` | LEGACY |
| `/api/speak` | POST (untouched) | `backend/routers/voice.py` | LEGACY |
| `/api/voice` | POST (untouched) | `backend/routers/voice.py` | LEGACY — marked as deprecated in the docstring |

**Compatibility rule:** the REST routers live in `voice.py` with `prefix="/api"`; the streaming router will be registered in `main.py` OUTSIDE that prefix (TODO comment already added in `main.py`). The frontend decides at runtime: if `WebSocket` is available → `/ws/audio`; if not → fall back to the 3 POSTs (detected via a handshake timeout ≤ 2 s).

---

## 3. Challenges & Requirements

### 3.1 Connection state management (backend)

- **Session state:** each connection needs its own `connection_id` to isolate the LLM's history, VAD state, and audio buffers. Module-level global state is forbidden.
- **Heartbeat / keepalive:** send a `ping` every 30 s; close dead sessions via `on_disconnect` (freeing history, buffers, timers) to avoid leaks on Render's free tier (limited RAM).
- **Race conditions:** if `stt_finalize` arrives while EdgeTTS is still emitting chunks from the previous interaction → use per-session queues (`asyncio.Queue`) and a pipeline semaphore (LISTENING → PROCESSING → SPEAKING → idle).

### 3.2 Frontend buffer control (Next.js)

- **Audio jitter buffer:** EdgeTTS's MP3 chunks don't arrive at a uniform cadence → a FIFO queue targeting `~120 ms` of initial buffer; if the queue runs dry → fill with silence (avoids audible cuts).
- **STT hypothesis management:** Whisper's partial output produces a hypothesis per chunk; the frontend must discard stale hypotheses and render only the `final` ones.
- **Backpressure:** if the server emits faster than the player can queue → pause consumption of LLM/TTS events (a `window_size` window) to avoid saturating memory.

### 3.3 Packet loss / reconnection

- WebSocket over TCP **doesn't lose data like UDP**, but it can drop (proxy, Render, mobile network). Requirements:
  1. Exponential reconnection (1s → 2s → 4s, max 30s) with handshake retry and history resync.
  2. **Last-interaction resume:** the client resends `last_token_count` in the handshake so the backend can resume idempotently (avoids duplicating TTS).
  3. Read timeouts on both sides; on the SSE flow use standard `retry:` + `event:` for additional resilience.
  4. On Render's free tier, WebSockets may require a paid plan → `GET /api/stream` SSE remains a documented alternative (hence its place in the fit map).

---

## 4. Implementation Requirements (PHASE 17+ checklist)

- [ ] `backend/routers/streaming.py` — `@app.websocket("/ws/audio")` + `GET /api/stream` SSE.
- [ ] `backend/core/connection_manager.py` — `connect / disconnect / send_personal_message / send_json`.
- [ ] `LLMService.chat_stream()` — async generator with `stream=True` (TODO already in `llm.py`).
- [ ] `TTSService.synthesize_stream()` — `async for chunk in communicate.stream()` without accumulating into a BytesIO.
- [ ] `STTService` — support for chunks / partial hypotheses.
- [ ] `frontend/lib/ws_client.js` — WS client with heartbeat, jitter buffer, and reconnection.
- [ ] Refactor `useSofiaVoice.js` — WS vs REST decision + `metrics` updates from `onmessage`.
- [ ] Update `TerminalLog.jsx` / `VoiceVisualizer.jsx` to consume streaming events.
- [ ] REST fallback test (without WS) and v2.0 vs v3.0 latency comparison.

## 5. Success Criteria

| Metric | v2.0 (baseline) | v3.0 (target) |
|---|---|---|
| TTFB (time to first token/audio) | ~1.3–1.8 s | **≤ 300 ms** |
| Perceived latency of the full response | ~1.5 s | **~0.8–1.2 s** (overlapped with TTS streaming) |
| Visible STT hypotheses while listening | No | Yes (partial) |
| Progressive text rendering | No (all at once) | Yes (token by token) |
| Fallback without WebSockets | — | REST v2.0 intact |

---

<div align="center">

*Living document — update after each architectural decision made in PHASE 17.*

</div>