# 🚀 STREAMING v3.0 — Plan de Arquitectura

> **Fase:** 16 · **Autor:** Rs4Machine · **Estado:** Planificación arquitectural (pre-implementación)
> **Objetivo:** Migrar el pipeline HTTP POST síncrono (Wait‑Then‑Play) a **Streaming bidireccional** (WebSockets + SSE) para reducir la latencia percibida y permitir TTFB casi instantáneo.

---

## 1. Contexto Actual (v2.0)

### 1.1 Pipeline síncrono actual — "Wait‑Then‑Play"

```
Frontend                FastAPI (Render)            Groq Cloud
   │  Graba audio (VAD)      │                          │
   ├── POST /api/transcribe ─▶│──▶ Whisper large-v3 ────▶│  (áudio completo)
   │  { "text": "..." }  ◀────│◀──── texto               │
   ├── POST /api/chat ───────▶│──▶ LLaMA (síncrono) ────▶│
   │  { "response": "..." } ◀─│◀──── respuesta completa   │
   ├── POST /api/speak ──────▶│──▶ EdgeTTS (BytesIO)     │
   │  { "audio_base64" }  ◀───│◀──── MP3 completo         │
   └── Reproduce (Audio.play) │                          │
```

### 1.2 Gargalo actual (medido)

| Etapa | Latencia típica | Notas |
|---|---|---|
| STT (Whisper via Groq) | ~0.4–0.7 s | Espera el **archivo completo**; sin hipótesis parciales |
| LLM (Groq síncrono) | ~0.5–0.8 s | Espera **todos los tokens** antes de responder |
| TTS (EdgeTTS → base64) | ~0.3–0.5 s | Acumula el MP3 entero + encode base64 + transferencia |
| **TOTAL percibido** | **~1.3 – 1.8 s** | El usuario NO ve nada hasta que todo termina |

**Causa raíz del "gargalo": no es la latencia de cada modelo — es el patrón de espera completa (wait‑then‑play).** Aunque Groq responda en ~200 ms, el ser humano percibe la suma de los 3 viajes de red + los 3 serializados base64 + la espera del audio completo.

### 1.3 Levantamiento actual de la infraestructura

- **Backend:** `backend/main.py` (FastAPI, CORS `*`, router `prefix="/api"`) → `backend/routers/voice.py` (4 endpoints REST) → `backend/services/{stt,llm,tts}.py` (cliente Groq / EdgeTTS).
- **Frontend:** `frontend/hooks/useSofiaVoice.js` → 3 `fetch` POST secuenciales (`/api/transcribe`, `/api/chat`, `/api/speak`), medición de `metrics` (STT/LLM/TTS/TOTAL) y HUD en `TerminalLog.jsx`.
- **Deploy:** Render (backend, free tier) · Vercel (frontend, Next.js 15).

---

## 2. Propuesta v3.0 — Streaming bidireccional

### 2.1 Flujo destino

```
Frontend                WS /ws/audio (FastAPI)      Groq · EdgeTTS
   │  handshake (session_id)  │                          │
   ├── send(binary chunk PCM)─▶│──▶ Whisper streaming ──▶│  (hipótesis parciales)
   │  ◀─ STT_PARTIAL (texto) ──│◀── hipótesis            │
   ├── send(stt_finalize) ─────▶│──▶ chat stream=True ──▶│
   │  ◀─ llm_token ×N (SSE) ───│◀── tokens              │
   │  ◀─ llm_done ─────────────│                          │
   │  ◀─ tts_chunk ×M (MP3) ───│◀── EdgeTTS por-stream   │
   └── jitter buffer → playback │                          │
```

### 2.2 Gestión por capas

| Capa | Responsabilidad | Componente propuesto |
|---|---|---|
| Transporte | WebSocket `/ws/audio` (FastAPI `@app.websocket`) + SSE de eventos para LLM | `backend/routers/streaming.py` (NUEVO) |
| Gestión de sesiones | Registro de conexiones, lifecycle `connect / receive / disconnect`, limpieza de recursos | `backend/core/connection_manager.py` (NUEVO) — patrón `ConnectionManager` canónico de FastAPI |
| STT streaming | Whisper por cachos con hipótesis parciales | `STTService.final_chunk()` + `STTService.transcribe_partial()` (EXTENDER) |
| LLM streaming | Generador async `chat_stream()` con `stream=True` de Groq (yield por token) | `LLMService.chat_stream()` (EXTENDER — TODO ya marcado) |
| TTS streaming | EdgeTTS ya produce `chunk["type"]=="audio"` en un `async for` → NO acumular, emitir | `TTSService.synthesize_stream()` (EXTENDER) |
| Frontend | Cliente WS con buffer de audio (jitter), render de tokens SSE, VAD que publica chunk PCM | `frontend/hooks/useSofiaVoice.js` (REFACTOR) + `frontend/lib/ws_client.js` (NUEVO) |

### 2.3 Mapa de encaje — dónde va cada endpoint (sin romper REST)

| Ruta nueva (v3.0) | Método | Archivo | Relación con REST legacy |
|---|---|---|---|
| `/ws/audio` | WebSocket | `backend/routers/streaming.py` | **Sustituye** a `/api/voice` (pipeline completo) |
| `/api/stream` (opcional) | GET SSE (`StreamingResponse`) | `backend/routers/streaming.py` | **Alternativa** para entornos donde el reverse proxy no soporte WS (Render free tier) |
| `/api/transcribe` | POST (intacto) | `backend/routers/voice.py` | LEGACY — se mantiene para clientes/scripts antiguos |
| `/api/chat` | POST (intacto) | `backend/routers/voice.py` | LEGACY |
| `/api/speak` | POST (intacto) | `backend/routers/voice.py` | LEGACY |
| `/api/voice` | POST (intacto) | `backend/routers/voice.py` | LEGACY — marcado como deprecated en docstring |

**Regla de compatibilidad:** los routers REST viven en `voice.py` con `prefix="/api"`; el router de streaming se registrará en `main.py` FUERA de ese prefijo (comentario TODO ya añadido en `main.py`). El frontend decide en runtime: si `WebSocket` está disponible → `/ws/audio`; si no → fallback a los 3 POST (detección con timeout de handshake ≤ 2 s).

---

## 3. Desafíos y Requisitos

### 3.1 Gestión de estado de conexión (backend)

- **Session state:** cada conexión necesita su propio `connection_id` para aislar la historia del LLM, el estado del VAD y los buffers de audio. Prohibido estado global por módulo.
- **Heartbeat / keepalive:** enviar `ping` cada 30 s; cerrar sesiones muertas con `on_disconnect` (liberar historia, buffers, timers) para evitar fugas en Render free (RAM limitada).
- **Race conditions:** al llegar `stt_finalize` mientras EdgeTTS aún está emitiendo chunks de la interacción anterior → usar colas (`asyncio.Queue`) por sesión y un semáforo de pipeline (LISTENING → PROCESSING → SPEAKING → idle).

### 3.2 Control de buffer en el frontend (Next.js)

- **Jitter buffer de audio:** los chunks MP3 de EdgeTTS no llegan con cadencia uniforme → cola FIFO con objetivo de `~120 ms` de buffer inicial; si la cola se vacía → rellenar con silencio (evita cortes audibles).
- **Gestión de hipótesis STT:** Whisper parcial produce hipótesis por cacho; el frontend debe descartar hipótesis obsoletas y renderizar solo las `final`.
- **Backpressure:** si el servidor emite más rápido de lo que el reproductor puede encolar → pausar el consumo de eventos LLM/TTS (ventana `window_size`) para no saturar memoria.

### 3.3 Pérdida de paquetes / reconexión

- WebSocket sobre TCP **no pierde datos como UDP**, pero sí se corta (proxy, Render, red móvil). Requisitos:
  1. Reconexión exponencial (1s → 2s → 4s, máx 30s) con reintento de handshake y resincronización de historial.
  2. **Resumen de última interacción**: el cliente reenvía `last_token_count` en el handshake para que el backend retome de forma idempotente (evita duplicar TTS).
  3. Timeouts de lectura en ambos lados; en el flujo SSE usar `retry:` + `event:` estándar para resiliencia adicional.
  4. En Render free tier los WebSockets pueden requerir plan de pago → `GET /api/stream` SSE queda como alternativa documentada (por eso está en el mapa de encaje).

---

## 4. Requisitos de Implementación (checklist FASE 17+)

- [ ] `backend/routers/streaming.py` — `@app.websocket("/ws/audio")` + `GET /api/stream` SSE.
- [ ] `backend/core/connection_manager.py` — `connect / disconnect / send_personal_message / send_json`.
- [ ] `LLMService.chat_stream()` — generador async con `stream=True` (TODO ya en `llm.py`).
- [ ] `TTSService.synthesize_stream()` — `async for chunk in communicate.stream()` sin acumular en BytesIO.
- [ ] `STTService` — soporte de cachos / hipótesis parciales.
- [ ] `frontend/lib/ws_client.js` — cliente WS con heartbeat, jitter buffer y reconexión.
- [ ] Refactor de `useSofiaVoice.js` — decisión WS vs REST + actualización de `metrics` desde `onmessage`.
- [ ] Actualizar `TerminalLog.jsx` / `VoiceVisualizer.jsx` para consumir eventos streaming.
- [ ] Test de fallback REST (sin WS) y comparativa de latencia v2.0 vs v3.0.

## 5. Criterios de Éxito

| Métrica | v2.0 (baseline) | v3.0 (objetivo) |
|---|---|---|
| TTFB (tiempo hasta primer token/audio) | ~1.3–1.8 s | **≤ 300 ms** |
| Latencia percibida de respuesta completa | ~1.5 s | **~0.8–1.2 s** (solapada con TTS streaming) |
| Hipótesis STT visibles durante la escucha | No | Sí (parciales) |
| Render progresivo del texto | No (todo de golpe) | Sí (token a token) |
| Fallback sin WebSockets | — | REST v2.0 intacto |

---

*Documento vivo — actualizar tras cada decisión de arquitectura de la FASE 17.*