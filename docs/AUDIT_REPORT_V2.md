<div align="center">

# 🔍 AUDIT_REPORT_V2 — SofiaVoice v2.0

[🇺🇸 English (this file)](AUDIT_REPORT_V2.md) · [🇧🇷 Português do Brasil](AUDIT_REPORT_V2.pt-BR.md)

**General Audit — Quality, Security, Performance & Testing**

</div>

---

## 📑 Table of Contents

- [Executive Summary](#-executive-summary)
- [1. Scope & Methodology](#1-scope--methodology)
- [2. Code Quality & Cleanliness (Code Review)](#2-code-quality--cleanliness-code-review)
- [3. Security & Hardening](#3-security--hardening)
- [4. Performance & Latency — v1.0 (gTTS) vs v2.0 (EdgeTTS + Groq)](#4-performance--latency--v10-gtts-vs-v20-edgetts--groq)
- [5. Test Execution](#5-test-execution)
- [6. Consolidated Findings Matrix by Severity](#6-consolidated-findings-matrix-by-severity)
- [7. Final Verdict — PHASE 18](#7-final-verdict--phase-18-release--git-tag-v200)
- [8. Recommended Action Plan](#8-recommended-action-plan-prioritized)
- [9. Annexes](#9-annexes)

---

| Field | Value |
|---|---|
| **Project** | SofiaVoice (Rs4Machine · Voice Intelligence System v2.0) |
| **Auditor** | Full technical review — QA + Security + Code Review |
| **Date** | 2026-09-09 |
| **Branch / Commit** | `main` · `f59469e` (13 modified files NOT committed + 4 untracked) |
| **Audited Environment** | Windows · Python 3.14.2 · FastAPI 0.141.1 · Groq 1.6.0 · Edge-TTS 7.2.8 · Next.js 15.5.12 · React 19 |
| **Coverage** | Backend `backend/` (FastAPI) · Frontend `frontend/` (Next.js) · Docs · Conversation logs |

---

## 📋 Executive Summary

| Pillar | Status | Verdict |
|---|---|---|
| Code Quality | 🟠 **Fair** | There are rough edges: legacy duplication (`src_old/`), dead imports, mixed ES/PT/EN strings, no structured logging. |
| Security & Hardening | 🔴 **High Risk** | `sanitize_text()` **does work** (verified), but **wildcard CORS**, **no 10 MB limit in v2.0**, and **no authentication** leave the API exposed. |
| Performance & Latency | 🟠 **Partial** | LLM at 0.42–1.08 s and STT ~0.84 s (excellent via Groq); **TTS via EdgeTTS at 1.6–2.5 s** (NOT faster than gTTS's 0.7–1.0 s on this network) and **the event loop blocks** on synchronous calls. |
| Test Execution | 🟠 **Manual, no automation** | No suite exists (pytest/locust/k6). 15+ live tests were executed and documented below. |
| Ready for PHASE 18 (tag v2.0.0) | 🔴 **NO-GO, conditional** | There are **5 critical findings** and 5 high-severity findings. See [Final Verdict (§7)](#7-final-verdict--phase-18-release--git-tag-v200). |

> **Short version:** the product works and the happy-path experience is good, but v2.0 is not hardened and is not cleanly deployable as it stands today (`edge-tts` is missing from `requirements.txt`, the 10 MB limit was left behind in `src_old/`, CORS is wide open). Once the blockers are fixed, it is release-ready.

---

## 1. Scope & Methodology

### 1.1 Files reviewed

- **Backend:** `main.py`, `config.py`, `routers/voice.py`, `services/{stt,llm,tts}.py`, `requirements.txt`, `render.yaml`, `src_old/*`, `.env.exemple`, logs.
- **Frontend:** `app/sofia-voice/page.jsx`, `app/layout.js`, `hooks/useSofiaVoice.js`, `components/SofiaVoice/*`, `constants/tokens.js`, `styles/sofia-voice.css`, `next.config.js`, `package.json`.
- **Docs:** `README.md`, `README.en.md`, `docs/ARCHITECTURE.md`, `docs/STREAMING_V3_PLAN.md`.

### 1.2 Tests executed live

1. Static compilation of the entire backend (`py_compile`) → **OK**.
2. Real boot of `uvicorn main:app` and an HTTP battery against `/api/chat`, `/api/speak`, `/api/transcribe`, `/api/voice`, `/health`, and CORS preflight.
3. **11 MB payload** test (verifies the 10 MB guard).
4. **HTML/script injection + prompt injection** test (verifies `sanitize_text`).
5. **Concurrency** test (5 simultaneous requests) to detect event-loop blocking.
6. **Local TTS benchmark**: gTTS (v1.0) vs EdgeTTS (v2.0), same machine and text.
7. **Full Next.js production build** (`npm run build`) → compiles and passes lint.

---

## 2. Code Quality & Cleanliness (Code Review)

### 2.1 Backend (FastAPI)

| ID | Finding | File | Severity |
|---|---|---|---|
| QC-01 | **Live dependency not declared:** the code imports `edge_tts`, but `requirements.txt` lists `gTTS` (which is no longer used). A clean deploy breaks with an `ImportError` on startup. | `requirements.txt` / `services/tts.py` | 🔴 Critical |
| QC-02 | **Dead import:** `from urllib import response` is unused. | `services/llm.py:3` | 🟡 Medium |
| QC-03 | **Blocking synchronous calls inside `async def`:** `stt.transcribe()` and `llm.chat()` are synchronous (network) and invoked directly inside coroutines → they block the entire event loop. Measured: 5 concurrent requests were serialized (wall time 3.69 s). | `routers/voice.py:47,71,111,121` | 🔴 Critical (perf) |
| QC-04 | **Error handler that crashes:** the `except` in `STTService` does `print("❌ …")`; on Windows (CP1252) the emoji triggers `UnicodeEncodeError` → the endpoint returns **500** instead of the graceful fallback. Reproduced live with the 11 MB payload. | `services/stt.py:29` (same pattern in `llm.py:54` and `tts.py:37`) | 🟠 High |
| QC-05 | **Global state shared across users:** `llm = LLMService()` is instantiated at module level and `self.history` is shared by **every** request → context leakage between sessions (privacy). `STREAMING_V3_PLAN.md` itself forbids this for v3. | `routers/voice.py:11-13` / `services/llm.py:15` | 🟠 High |
| QC-06 | **Duplicated/orphaned code:** `backend/src_old/main.py` still holds the sanitizer + 10 MB limit + restricted CORS that **are no longer applied** in v2.0. Risk of editing the wrong file. | `backend/src_old/` | 🟡 Medium |
| QC-07 | **No structured logging:** everything is `print()`; external Groq errors are printed in full with no context or level. | `services/*.py` | 🟡 Medium |
| QC-08 | **Inconsistent contracts:** `/api/voice` doesn't validate `content_type` or empty files (unlike `/api/transcribe`), has no error handling of its own, and can return an empty `audio_base64` with HTTP 200 if TTS fails; LLM responses aren't sanitized before being returned/synthesized. | `routers/voice.py:98-142` | 🟡 Medium |

### 2.2 Frontend (Next.js)

| ID | Finding | File | Severity |
|---|---|---|---|
| QC-09 | **Experimental Chrome APIs:** `navigator.mediaDevices.getUserMedia`, `new MediaRecorder(stream,…)`, `audioContext.createAnalyser()`, `createMediaStreamSource()`, `new Audio(src)` — none of them are cross-platform standards; only works on recent Chrome, with no fallback for Firefox/Safari. | `hooks/useSofiaVoice.js:129-142,257` | 🟠 High (portability) |
| QC-10 | **No quality automation:** no unit/E2E tests, no dedicated lint/typecheck, no CI. The build only goes through Next's embedded mini-lint. | `package.json` | 🟡 Medium |
| QC-11 | **Outdated labels:** the footer says `gTTS:active` when v2.0 uses **EdgeTTS**; strings mix ES/PT ("PUSH TO TALK" vs "Desativar microfone"). | `app/sofia-voice/page.jsx:143` | 🟢 Low |
| QC-12 | **Massive inline styling:** the orchestrator and components load dozens of `style={{…}}` objects; the global CSS only has keyframes. Medium-low maintainability. | `page.jsx`, `TerminalLog.jsx`, etc. | 🟢 Low |
| QC-13 | **Minimal, healthy dependencies:** only `next/react/react-dom`; no third-party runtime packages (a plus). | `package.json` | ✅ Positive |

---

## 3. Security & Hardening

### 3.1 `sanitize_text()` — ✅ Operational (partial)

`routers/voice.py:16-24` strips `<...>` tags and control characters and caps input at 2000 characters. **Live test:** the payload with `<script>alert(1)</script><img src=x onerror=alert(2)>` reached the log with no tags at all.

**Limitations:**

- It only covers **input**. The **LLM's output is not sanitized** before being returned or synthesized → a manipulated model could emit unwanted HTML/instructions (low risk, but it exists).
- There is no sanitization on **persisted logs** beyond the already-cleaned input (in `/api/voice` the raw model response passes through).

### 3.2 CORS — 🔴 NOT restricted

`backend/main.py:12-17` uses `allow_origins=["*"]` with `allow_methods=["*"]`. **Live preflight:**

```
OPTIONS /api/chat · Origin: http://evil.com
HTTP/1.1 200 OK
access-control-allow-origin: *
access-control-allow-methods: DELETE, GET, HEAD, OPTIONS, PATCH, POST, PUT
```

The "restricted" version lives only in `src_old/main.py` ("14.2 — CORS Restricted to Frontend", `localhost:3000`). **The CORS guard is NOT active in v2.0:** any site can call the API from a victim's browser and burn through Groq credits.

### 3.3 10 MB payload guard — 🔴 NOT active

The `limit_payload_size` middleware (HTTP 413 for >10 MB) exists **only in `backend/src_old/main.py`**; **it is not present in `backend/main.py` or in the v2.0 routers**.

**Live test:** an 11 MB upload to `/api/transcribe` → **no 413** (it ended in a 500 due to bug QC-04). An attacker can upload huge files and exhaust the worker's memory (DoS). This also applies to `/api/chat` and `/api/speak` (the JSON is read fully into memory before being truncated to 2000 characters via `sanitize_text`).

### 3.4 Other security findings

| ID | Finding | Detail | Severity |
|---|---|---|---|
| S-01 | **No authentication or rate limiting** on any endpoint → direct abuse of the Groq API key (cost) and spam. | — | 🔴 Critical (with a public domain) |
| S-02 | **Context leakage between users** via `LLMService.history` being global (QC-05) → privacy issue. | `services/llm.py:15` | 🟠 High |
| S-03 | **No timeout on the Groq client** → a hung call leaves the connection open indefinitely (simple DoS and poor UX). | `services/llm.py:38` / `stt.py:16` | 🟠 High |
| S-04 | **External errors printed unfiltered** (full Groq trace to stdout via `print`) and flat 500s to the client (reproduced with 11 MB). | `stt.py` / `voice.py` | 🟡 Medium |
| S-05 | `.env` properly ignored; **no committed credentials found**. | `.gitignore` | ✅ Positive |
| S-06 | Untracked junk files in the root (`teste.txt`) and duplicated `logs/` in root vs `backend/logs/` → noise and possible conversation exposure in the repo. | root | 🟢 Low |

---

## 4. Performance & Latency — v1.0 (gTTS) vs v2.0 (EdgeTTS + Groq)

### 4.1 Local empirical measurement (2026-09-09)

| Stage | v1.0 (baseline) | v2.0 measured | Source |
|---|---|---|---|
| STT (Whisper large-v3 via Groq) | ~0.4–0.7 s (documented) | **0.835 s** | server log `[LATÊNCIA - STT]` |
| LLM (Groq) | — (single round-trip only) | **0.42–1.08 s** (3 samples: 0.416 / 0.703 / 1.078) | server log `[LATÊNCIA - LLM]` |
| TTS synthesis (gTTS vs EdgeTTS, same text) | **0.70–1.01 s** (avg ~0.85 s) | **1.62–2.51 s** (avg ~2.0 s) | local benchmark + `/api/speak` |
| Generated MP3 size | 64.5 KB (gTTS) | **30.8 KB (EdgeTTS)** → **−52%** | local benchmark |
| Full `/api/voice` pipeline | — | **2.94 s** (1-second fake audio) | curl |
| 3-POST pipeline (frontend) | — | **≈ 3.8–4.4 s** (0.84 + 0.4–1.1 + 2.5) | sum of measurements |

**Honest read of the TTS benchmark:**

- On this network, **EdgeTTS was SLOWER than gTTS** in raw synthesis (~2.0 s vs ~0.85 s average).
- However, EdgeTTS's audio weighs **half as much** (30.8 KB vs 64.5 KB): the transfer to the browser and the decode are faster, and the neural voice (`pt-BR-FranciscaNeural`) is more natural.
- The real latency drop in v2.0 comes from **Groq** (Whisper + LLM in a single network pass, LLM TTFB ~0.4 s) and from removing the ElevenLabs detour from intermediate versions. The v3.0 goal (≤300 ms TTFB with streaming) remains pending and is correctly planned in `docs/STREAMING_V3_PLAN.md`.

### 4.2 Measured bottleneck: blocked event loop 🧨

Test with **5 concurrent `/api/chat`** requests:

| Metric | Result |
|---|---|
| Individual duration | 1.00 / 1.52 / 2.63 / 3.25 / 3.69 s |
| **Total wall time** | **3.69 s** (≈ serialization: each request waits for the previous one) |
| With one worker and `async def` endpoints calling synchronous `llm.chat()` | The server CANNOT serve 2 requests at once |

**Conclusion:** under real load (2+ users), latency degrades linearly. The Groq/EdgeTTS calls need to move to `run_in_executor`/`AsyncGroq`, or use `def` (FastAPI runs those in a threadpool) — for example, the TTS `while` loop is already `await`, but `transcribe` and `chat` are not.

---

## 5. Test Execution

> No load/security scripts (PowerShell/Python) or `pytest` suite exist in the repo. Real tests were executed against the server running locally (`uvicorn main:app --port 8010`).

### 5.1 Live HTTP battery

| # | Test | Result | Code | Time |
|---|---|---|---|---|
| 1 | `GET /health` | `{"status":"ok","version":"2.0.0"}` | 200 | instant |
| 2 | `OPTIONS /api/chat` · Origin `http://evil.com` | **CORS wide open (`allow-origin: *`)** | 200 | — |
| 3 | `POST /api/chat` normal message | Correct response in PT | 200 | 0.72 s (LLM 0.703 s) |
| 4 | `POST /api/chat` `<script>`/`<img onerror>` injection | Tags **stripped** (verified in log) + LLM rejected the request | 200 | 0.44 s |
| 5 | `POST /api/chat` empty message | `"Mensagem não pode ser vazia…"` | **400** | — |
| 6 | `POST /api/chat` 5000 characters | Accepted (truncated to 2000 by `sanitize_text`) | 200 | 1.08 s |
| 7 | `POST /api/speak` valid text | MP3 base64 (41,088 chars) · `latency_seconds: 2.513` | 200 | 2.52 s |
| 8 | `POST /api/speak` empty text | `"Texto não pode ser vazio…"` | **400** | — |
| 9 | `POST /api/transcribe` content-type `octet-stream` | `"Envie um arquivo de áudio."` | **400** | — |
| 10 | `POST /api/transcribe` 1-second silent WAV | **Whisper hallucinated** `"Apenas o que você quer."` (missing VAD/validation) | 200 | 0.84 s |
| 11 | `POST /api/transcribe` **11 MB** | **No 413** → `UnicodeEncodeError` in the `except` → **500** | 500 | 12.7 s |
| 12 | `POST /api/voice` full pipeline (fake WAV) | JSON with `user_text` + `ai_response` + `audio_base64` | 200 | 2.94 s |
| 13 | 5 × concurrent `POST /api/chat` | **Event-loop serialization** (wall time 3.69 s) | 200 | see §4.2 |
| 14 | `python -m py_compile` (whole backend) | **OK** | — | — |
| 15 | `npm run build` (Next.js production) | **Compiles + lint OK** · First Load JS 108 kB | — | — |
| 16 | Local TTS benchmark ×2 (gTTS / EdgeTTS) | 0.70–1.01 s / 1.62–1.96 s; 64.5 KB / 30.8 KB | — | — |

### 5.2 Server log evidence (excerpt)

```
[LATÊNCIA - LLM (Groq)]:    0.703s
[LATÊNCIA - LLM (Groq)]:    0.416s
[LATÊNCIA - LLM (Groq)]:    1.078s
[LATÊNCIA - TTS (EdgeTTS)]: 2.513s
[LATÊNCIA - STT (Whisper)]: 0.835s
POST /api/transcribe HTTP/1.1" 500 Internal Server Error   ← UnicodeEncodeError (CP1252)
```

---

## 6. Consolidated Findings Matrix by Severity

| Severity | IDs | Count |
|---|---|---|
| 🔴 **Critical (release blocker)** | QC-01 (edge-tts missing from `requirements.txt`) · QC-03 (blocked event loop) · S-01 (no auth/rate limit) · CORS `*` (S-00) · Missing 10 MB payload guard (S-00) | 5 |
| 🟠 **High** | QC-04 (except crashes on Windows) · QC-05 (global history) · QC-09 (experimental Chrome APIs) · S-02 · S-03 | 5 |
| 🟡 **Medium** | QC-02 · QC-06 · QC-07 · QC-08 · QC-10 · S-04 | 6 |
| 🟢 **Low** | QC-11 · QC-12 · S-06 · outdated docs (README/ARCHITECTURE) · missing `.env.exemple` in `backend/` | 5 |
| ✅ **Positives** | QC-13 (minimal deps) · S-05 (no secrets in git) · `sanitize_text` operational · Next build OK · 400 validation on chat/speak | 5 |

---

## 7. Final Verdict — PHASE 18 (Release / Git Tag v2.0.0)

### ✅ Pros (what's ready to ship)

1. **The happy path works end to end** and the metrics HUD (STT/LLM/TTS/TOTAL) is real, measured, and visible on the frontend.
2. **Input sanitization is operational and verified** (HTML tags stripped in a live test).
3. **No committed credentials**; `.env` ignored; minimal frontend runtime dependencies (only Next/React).
4. **Clean Next.js production build** (compile + lint + static routes OK).
5. **Compact, readable backend code** at the services layer; the `routers/services` separation is sound.
6. **A well-documented v3.0 plan** (`STREAMING_V3_PLAN.md`): the next architectural step is clear and consistent with this audit's findings (sessions, async, buffer).

### ❌ Cons (why v2.0.0 cannot be declared today)

1. **`requirements.txt` is broken for a clean deploy** (missing `edge-tts`; leftover `gTTS`) → the startup fails on Render/CI.
2. **CORS wide open to `*`** with **no authentication or rate limiting on the API** → anyone can burn through the Groq budget and read/alter the bot's global context.
3. **The 10 MB guard does not exist in the v2.0 code** (it was left in `src_old/`) → a memory-based DoS vector (verified: 11 MB does not trigger a 413).
4. **Zero concurrency**: a single request blocks the server (measured) → poor behavior with 2+ users.
5. **Encoding bug in the `except` blocks** breaks error handling on Windows (`500` instead of a graceful fallback) — the author's own dev environment is affected.
6. **LLM history state is global** → privacy leak between users.
7. **Zero test automation** (no pytest, no load/security scripts, no CI): "quality assurance" is manual.
8. **Outdated docs** (README/ARCHITECTURE say gTTS/LLaMA 3.3 70B/Railway; the frontend footer says `gTTS:active`) → contradict the v2.0 code.
9. **Frontend locked to Chrome** via experimental APIs → not cross-platform in practice.

### 🎯 Verdict

> ## 🔴 **NO-GO, conditional, for tag `v2.0.0`**
> The current state of `main` + uncommitted changes **should not** be marked as a published v2.0.0 in a public environment. Once the **5 critical issues** are fixed (or at least the 3 structural ones: `requirements.txt`, CORS/payload guard in `main.py`, async in the routers) and an automated test pass is added, PHASE 18 is **a few hours of work away**. In the meantime, it is recommended to **keep v2.0 as an internal tag `v2.0.0-rc.1`** in the local git.

---

## 8. Recommended Action Plan (prioritized)

| # | Action | Effort | Impact |
|---|---|---|---|
| 1 | Add `edge-tts` and pin dependencies (`requirements.txt` with pins or `uv.lock`); remove `gTTS`. | Low | Removes the deploy blocker |
| 2 | Restore in `backend/main.py` the **payload middleware (10 MB → 413)** and restrict **CORS** to real origins (Vercel + localhost + own domain). | Low | Closes 2 critical vectors |
| 3 | Make it genuinely async: `AsyncGroq` (`groq.AsyncGroq`) or `run_in_executor`, with `await` in the routers. | Medium | Real concurrency |
| 4 | Replace `print("❌…")` with `logging` using `errors="replace"`/safe UTF-8; centralize exception handling to return clean JSON. | Low | Cross-platform robustness |
| 5 | Move `self.history` to a per-user `session_id` (or defer the redesign to v3.0) and add basic **rate limiting** (slowapi/limits) + minimal API-key auth. | Medium | Privacy and cost control |
| 6 | Remove `src_old/` or mark it as a frozen folder; delete `teste.txt`; unify `logs/` (root vs backend). | Low | Repo hygiene |
| 7 | Add a minimal suite: `pytest` for `sanitize_text` + endpoints (TestClient), and a load script (locust/k6) reusing this audit's cases. | Medium | Reproducible QA |
| 8 | Update README/ARCHITECTURE/footer to EdgeTTS + gpt-oss-20b + Render; keep `.env.exemple` inside `backend/`. | Low | Brand consistency |
| 9 | Commit/clean the tree: there are **13 modified files + 4 untracked** uncommitted; traceability is lost for the release. | Low | Governance |

---

## 9. Annexes

- **Audit artifacts:** all temporary test files (payloads, 11 MB binaries, server logs, concurrency script, `.next/`) were **deleted** after execution; the git tree was left exactly as it was.
- **Methodological note:** TTS timings depend on network and provider; the local benchmark used the same text and machine for gTTS and EdgeTTS.
- **Living document:** this report should be re-run (`AUDIT_REPORT_V2.md`) once the critical issues are closed and before the final tag.

---

<div align="center">

*Audit performed on 2026-09-09 · SofiaVoice v2.0 · Rs4Machine — End of report.*

</div>