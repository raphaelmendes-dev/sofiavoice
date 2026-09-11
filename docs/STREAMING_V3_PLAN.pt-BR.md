<div align="center">

# 🚀 STREAMING v3.0 — Plano de Arquitetura

[🇺🇸 English](STREAMING_V3_PLAN.md) · [🇧🇷 Português do Brasil (este arquivo)](STREAMING_V3_PLAN.pt-BR.md)

</div>

---

## 📑 Sumário

- [1. Contexto Atual (v2.0)](#1-contexto-atual-v20)
- [2. Proposta v3.0 — Streaming Bidirecional](#2-proposta-v30--streaming-bidirecional)
- [3. Desafios e Requisitos](#3-desafios-e-requisitos)
- [4. Requisitos de Implementação (checklist FASE 17+)](#4-requisitos-de-implementação-checklist-fase-17)
- [5. Critérios de Sucesso](#5-critérios-de-sucesso)

---

> **Fase:** 16 · **Autor:** Rs4Machine · **Status:** Planejamento arquitetural (pré-implementação)
> **Objetivo:** Migrar o pipeline HTTP POST síncrono (Wait-Then-Play) para **streaming bidirecional** (WebSockets + SSE), reduzindo a latência percebida e viabilizando um TTFB quase instantâneo.

---

## 1. Contexto Atual (v2.0)

### 1.1 Pipeline síncrono atual — "Wait-Then-Play"

```
Frontend                FastAPI (Render)            Groq Cloud
   │  Grava áudio (VAD)      │                          │
   ├── POST /api/transcribe ─▶│──▶ Whisper large-v3 ────▶│  (áudio completo)
   │  { "text": "..." }  ◀────│◀──── texto               │
   ├── POST /api/chat ───────▶│──▶ LLaMA (síncrono) ────▶│
   │  { "response": "..." } ◀─│◀──── resposta completa    │
   ├── POST /api/speak ──────▶│──▶ EdgeTTS (BytesIO)     │
   │  { "audio_base64" }  ◀───│◀──── MP3 completo         │
   └── Reproduz (Audio.play)  │                          │
```

### 1.2 Gargalo atual (medido)

| Etapa | Latência típica | Notas |
|---|---|---|
| STT (Whisper via Groq) | ~0.4–0.7 s | Espera o **arquivo completo**; sem hipóteses parciais |
| LLM (Groq síncrono) | ~0.5–0.8 s | Espera **todos os tokens** antes de responder |
| TTS (EdgeTTS → base64) | ~0.3–0.5 s | Acumula o MP3 inteiro + encode base64 + transferência |
| **TOTAL percebido** | **~1.3 – 1.8 s** | O usuário NÃO vê nada até tudo terminar |

**Causa raiz do "gargalo": não é a latência de cada modelo — é o padrão de espera completa (wait-then-play).** Mesmo que o Groq responda em ~200 ms, o usuário percebe a soma das 3 viagens de rede + os 3 payloads base64 serializados + a espera pelo áudio completo.

### 1.3 Levantamento da infraestrutura atual

- **Backend:** `backend/main.py` (FastAPI, CORS `*`, router `prefix="/api"`) → `backend/routers/voice.py` (4 endpoints REST) → `backend/services/{stt,llm,tts}.py` (cliente Groq / EdgeTTS).
- **Frontend:** `frontend/hooks/useSofiaVoice.js` → 3 `fetch` POST sequenciais (`/api/transcribe`, `/api/chat`, `/api/speak`), medição de `metrics` (STT/LLM/TTS/TOTAL) e HUD em `TerminalLog.jsx`.
- **Deploy:** Render (backend, free tier) · Vercel (frontend, Next.js 15).

---

## 2. Proposta v3.0 — Streaming Bidirecional

### 2.1 Fluxo de destino

```
Frontend                WS /ws/audio (FastAPI)      Groq · EdgeTTS
   │  handshake (session_id)  │                          │
   ├── send(binary chunk PCM)─▶│──▶ Whisper streaming ──▶│  (hipóteses parciais)
   │  ◀─ STT_PARTIAL (texto) ──│◀── hipótese              │
   ├── send(stt_finalize) ─────▶│──▶ chat stream=True ──▶│
   │  ◀─ llm_token ×N (SSE) ───│◀── tokens               │
   │  ◀─ llm_done ─────────────│                          │
   │  ◀─ tts_chunk ×M (MP3) ───│◀── EdgeTTS por-stream    │
   └── jitter buffer → playback │                          │
```

### 2.2 Gestão por camadas

| Camada | Responsabilidade | Componente proposto |
|---|---|---|
| Transporte | WebSocket `/ws/audio` (FastAPI `@app.websocket`) + stream de eventos SSE para o LLM | `backend/routers/streaming.py` (NOVO) |
| Gestão de sessões | Registro de conexões, ciclo de vida `connect / receive / disconnect`, limpeza de recursos | `backend/core/connection_manager.py` (NOVO) — padrão canônico `ConnectionManager` do FastAPI |
| STT streaming | Whisper em blocos com hipóteses parciais | `STTService.final_chunk()` + `STTService.transcribe_partial()` (ESTENDER) |
| LLM streaming | Gerador async `chat_stream()` com `stream=True` do Groq (yield por token) | `LLMService.chat_stream()` (ESTENDER — TODO já marcado) |
| TTS streaming | EdgeTTS já produz `chunk["type"]=="audio"` em um `async for` → NÃO acumular, emitir | `TTSService.synthesize_stream()` (ESTENDER) |
| Frontend | Cliente WS com buffer de áudio (jitter), renderização de tokens via SSE, VAD publicando chunks PCM | `frontend/hooks/useSofiaVoice.js` (REFATORAR) + `frontend/lib/ws_client.js` (NOVO) |

### 2.3 Mapa de encaixe — onde cada endpoint se encaixa (sem quebrar o REST)

| Rota nova (v3.0) | Método | Arquivo | Relação com o REST legado |
|---|---|---|---|
| `/ws/audio` | WebSocket | `backend/routers/streaming.py` | **Substitui** `/api/voice` (pipeline completo) |
| `/api/stream` (opcional) | GET SSE (`StreamingResponse`) | `backend/routers/streaming.py` | **Alternativa** para ambientes onde o reverse proxy não suporta WS (Render free tier) |
| `/api/transcribe` | POST (intocado) | `backend/routers/voice.py` | LEGADO — mantido para clientes/scripts antigos |
| `/api/chat` | POST (intocado) | `backend/routers/voice.py` | LEGADO |
| `/api/speak` | POST (intocado) | `backend/routers/voice.py` | LEGADO |
| `/api/voice` | POST (intocado) | `backend/routers/voice.py` | LEGADO — marcado como deprecated na docstring |

**Regra de compatibilidade:** os routers REST vivem em `voice.py` com `prefix="/api"`; o router de streaming será registrado em `main.py` FORA desse prefixo (comentário TODO já adicionado em `main.py`). O frontend decide em runtime: se `WebSocket` estiver disponível → `/ws/audio`; se não → fallback para os 3 POSTs (detecção com timeout de handshake ≤ 2 s).

---

## 3. Desafios e Requisitos

### 3.1 Gestão de estado de conexão (backend)

- **Estado de sessão:** cada conexão precisa do seu próprio `connection_id` para isolar o histórico do LLM, o estado do VAD e os buffers de áudio. Estado global por módulo é proibido.
- **Heartbeat / keepalive:** enviar um `ping` a cada 30 s; encerrar sessões mortas via `on_disconnect` (liberando histórico, buffers, timers) para evitar vazamentos no Render free tier (RAM limitada).
- **Condições de corrida:** se `stt_finalize` chegar enquanto o EdgeTTS ainda estiver emitindo chunks da interação anterior → usar filas por sessão (`asyncio.Queue`) e um semáforo de pipeline (LISTENING → PROCESSING → SPEAKING → idle).

### 3.2 Controle de buffer no frontend (Next.js)

- **Jitter buffer de áudio:** os chunks MP3 do EdgeTTS não chegam com cadência uniforme → uma fila FIFO com alvo de `~120 ms` de buffer inicial; se a fila esvaziar → preencher com silêncio (evita cortes audíveis).
- **Gestão de hipóteses do STT:** o Whisper parcial produz uma hipótese por bloco; o frontend deve descartar hipóteses obsoletas e renderizar apenas as `final`.
- **Backpressure:** se o servidor emitir mais rápido do que o player consegue enfileirar → pausar o consumo de eventos LLM/TTS (uma janela `window_size`) para não saturar a memória.

### 3.3 Perda de pacotes / reconexão

- WebSocket sobre TCP **não perde dados como UDP**, mas pode cair (proxy, Render, rede móvel). Requisitos:
  1. Reconexão exponencial (1s → 2s → 4s, máx. 30s) com retentativa de handshake e resincronização de histórico.
  2. **Retomada da última interação:** o cliente reenvia `last_token_count` no handshake para que o backend retome de forma idempotente (evita duplicar o TTS).
  3. Timeouts de leitura em ambos os lados; no fluxo SSE, usar `retry:` + `event:` padrão para resiliência adicional.
  4. No Render free tier, WebSockets podem exigir plano pago → `GET /api/stream` via SSE permanece como alternativa documentada (por isso está no mapa de encaixe).

---

## 4. Requisitos de Implementação (checklist FASE 17+)

- [ ] `backend/routers/streaming.py` — `@app.websocket("/ws/audio")` + `GET /api/stream` SSE.
- [ ] `backend/core/connection_manager.py` — `connect / disconnect / send_personal_message / send_json`.
- [ ] `LLMService.chat_stream()` — gerador async com `stream=True` (TODO já em `llm.py`).
- [ ] `TTSService.synthesize_stream()` — `async for chunk in communicate.stream()` sem acumular em BytesIO.
- [ ] `STTService` — suporte a blocos / hipóteses parciais.
- [ ] `frontend/lib/ws_client.js` — cliente WS com heartbeat, jitter buffer e reconexão.
- [ ] Refatorar `useSofiaVoice.js` — decisão WS vs REST + atualização de `metrics` a partir do `onmessage`.
- [ ] Atualizar `TerminalLog.jsx` / `VoiceVisualizer.jsx` para consumir eventos de streaming.
- [ ] Teste de fallback REST (sem WS) e comparativo de latência v2.0 vs v3.0.

## 5. Critérios de Sucesso

| Métrica | v2.0 (baseline) | v3.0 (objetivo) |
|---|---|---|
| TTFB (tempo até o primeiro token/áudio) | ~1.3–1.8 s | **≤ 300 ms** |
| Latência percebida da resposta completa | ~1.5 s | **~0.8–1.2 s** (sobreposta ao streaming do TTS) |
| Hipóteses do STT visíveis durante a escuta | Não | Sim (parciais) |
| Renderização progressiva do texto | Não (tudo de uma vez) | Sim (token a token) |
| Fallback sem WebSockets | — | REST v2.0 intacto |

---

<div align="center">

*Documento vivo — atualizar após cada decisão de arquitetura da FASE 17.*

</div>