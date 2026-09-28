<div align="center">
<img src="assets/Rs4Machine.png" alt="Rs4Machine Logo" width="380" />

# 🎙️ SofiaVoice v2.0 — Rs4Machine

<img src="sofia-voice.gif" alt="SofiaVoice Demo" width="100%" />

**AI voice system for low-latency speech interaction**

SofiaVoice is a public RS4 Lab experiment covering an asynchronous STT → LLM → TTS pipeline with session-isolated conversation handling.

[![Live App](https://img.shields.io/badge/🚀-Live%20App-blue?style=for-the-badge)](https://ai-voice-assistant-groq.vercel.app)
[![API Docs](https://img.shields.io/badge/📡-API%20Docs-informational?style=for-the-badge)](https://sofia-voice-backend.onrender.com/docs)
[![GitHub](https://img.shields.io/badge/GitHub-Profile-181717?style=for-the-badge&logo=github)](https://github.com/raphaelmendes-dev)

[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Python](https://img.shields.io/badge/Python-3.14.2-blue.svg)](https://www.python.org)
[![Next.js](https://img.shields.io/badge/Next.js-15-black.svg)](https://nextjs.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-Async-009688.svg)](https://fastapi.tiangolo.com)

**🇺🇸 English (this file)** · [🇧🇷 Português do Brasil](README.pt-BR.md)

</div>

---

## 📑 Table of Contents

- [Overview](#-overview)
- [Key Improvements in v2.0.0](#-key-improvements-in-v200)
- [Performance Benchmarks](#-performance-benchmarks-v10-vs-v20)
- [Architecture](#️-architecture)
- [Tech Stack](#️-tech-stack)
- [Running Locally](#-running-locally)
- [API Endpoints](#-api-endpoints)
- [Contributing](#-contributing)
- [License](#-license)
- [Contact](#-contact)

---

## 🎯 Overview

**SofiaVoice** is a voice-system experiment developed by **Rs4Machine** within the **RS4 Lab**. It implements a conversational pipeline that receives audio, transcribes it, generates a response, and synthesizes speech.

The public v2.0 implementation focuses on asynchronous execution, a smaller audio payload, session-isolated state, and explicit API boundaries. The system is designed for measurement and iteration rather than opaque autonomy.

**Official positioning:** AI Systems Engineer focused on hybrid architectures (LLM + deterministic logic) to eliminate hallucinations and ensure auditability in production.

---

## ⚡ Key Improvements in v2.0.0

- **Asynchronous Pipeline** — Full async execution (`AsyncGroq` + `Edge-TTS`) without blocking the event loop.
- **Neural TTS Migration** — Replaced legacy `gTTS` with Microsoft `Edge-TTS` (FranciscaNeural), reducing audio payload sizes by **52%**.
- **Hardened Security** — Strict CORS domain mapping, 10 MB payload limits (HTTP 413), and input sanitization against XSS.
- **Session Isolation** — Independent conversation state handling per request session.

---

## ⚡ Performance Benchmarks (v1.0 vs v2.0)

| Metric / Stage | Baseline v1.0 (LLaMA 3.3 70B · gTTS) | v2.0 (openai/gpt-oss-20b · Edge-TTS) | Optimization Gain |
|---|---|---|---|
| **STT Latency (Whisper V3)** | ~0.84s | **~0.84s** | — |
| **LLM Latency (LLaMA 3.3 70B → openai/gpt-oss-20b)** | ~0.70s | **~0.70s** | — |
| **TTS Engine Synthesis** | ~4.41s | **~1.60s – 2.50s** | **~40% faster** |
| **Audio Payload Size** | 64.5 KB | **30.8 KB** | **52% smaller payload** |
| **Execution Architecture** | Synchronous / Blocking | **Pure Async / Non-blocking** | Zero thread blocking |

---

## 🏗️ Architecture

```text
sofiavoice/
├── frontend/                        → Next.js 15 (Vercel)
│   ├── app/sofia-voice/page.jsx     → Main orchestrator
│   ├── components/SofiaVoice/       → Voice interface components
│   ├── hooks/useSofiaVoice.js       → Web Audio API + API client
│   └── styles/                      → Custom UI animations
│
└── backend/                         → Python 3.14 + FastAPI (Render)
    ├── main.py                      → FastAPI instance, CORS & security middleware
    ├── config.py                    → Environment configuration
    ├── routers/voice.py              → Async voice pipeline routes
    └── services/
        ├── stt.py                   → Whisper Large v3 via Groq
        ├── llm.py                   → openai/gpt-oss-20b via AsyncGroq
        └── tts.py                   → Edge-TTS (FranciscaNeural)
```

---

## 🛠️ Tech Stack

| Layer | Technology | Specification |
|---|---|---|
| **Frontend** | Next.js 15 + React 19 | App Router + Web Audio API |
| **Styling** | CSS Modules / Tokens | Rs4Machine design system |
| **Backend** | Python 3.14.2 + FastAPI | Asynchronous ASGI execution |
| **Speech-to-Text** | Groq API | Whisper Large v3 |
| **Intelligence** | Groq API | openai/gpt-oss-20b via AsyncGroq |
| **Text-to-Speech** | Edge-TTS | Microsoft neural voice (pt-BR-FranciscaNeural) |
| **Deployment** | Vercel (frontend) + Render (backend) | Public deployment |

---

## 🚀 Running Locally

### Backend Setup

```bash
cd backend
python -m venv .venv

# Linux/Mac
source .venv/bin/activate
# Windows
.venv\Scripts\activate

pip install -r requirements.txt
```

Create a `.env` file inside `backend/`:

```env
GROQ_API_KEY=your_groq_api_key_here
ALLOWED_ORIGINS=http://localhost:3000
```

Start the asynchronous API server:

```bash
uvicorn main:app --reload --port 8000
```

Interactive API documentation: `http://localhost:8000/docs`

### Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

Create a `.env.local` file inside `frontend/`:

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
```

Open the application at: `http://localhost:3000/sofia-voice`

---

## 📡 API Endpoints

| Method | Route | Description | Status Code |
|---|---|---|---|
| `GET` | `/health` | API operational check | `200 OK` |
| `POST` | `/api/transcribe` | Audio file → text transcription | `200 OK` / `400 Bad Request` |
| `POST` | `/api/chat` | Text prompt → AI response | `200 OK` / `400 Bad Request` |
| `POST` | `/api/speak` | Text prompt → neural Base64 audio | `200 OK` / `400 Bad Request` |
| `POST` | `/api/voice` | Full end-to-end pipeline | `200 OK` / `413 Payload Too Large` |

---

## 🤝 Contributing

Contributions, issues, and documentation improvements are welcome.

1. Fork the project
2. Create a feature branch (`git checkout -b feature/your-change`)
3. Commit your changes using [Conventional Commits](https://www.conventionalcommits.org/)
4. Push the branch (`git push origin feature/your-change`)
5. Open a Pull Request

---

## 📄 License

This project is licensed under the **MIT License** — see [LICENSE](LICENSE) for details.

---

## 📬 Contact

**Raphael Mendes**  
**AI Systems Engineer & Founder · Rs4Machine**

- 📧 [python.dev.raphael@gmail.com](mailto:python.dev.raphael@gmail.com)
- 🔗 [LinkedIn](https://www.linkedin.com/in/raphaelmendes-dev/)
- 🌐 [Portfolio](https://portfolio-modular-rs4-machine.vercel.app/)

<div align="center">

*SofiaVoice v2.0.0 · RS4 Lab · September 2026*

</div>
