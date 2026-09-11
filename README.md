<div align="center">
<img src="assets/Rs4Machine.png" alt="Rs4Machine Logo" width="380" />

# 🎙️ SofiaVoice — Rs4Machine

<img src="sofia-voice.gif" alt="SofiaVoice Demo" width="100%" />

**Voice Intelligence System v2.0.0**

Production-grade AI voice assistant — listens, understands, and responds in real time with low latency.

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
- [Corporate & Research Contact](#-corporate--research-contact)

---

## 🎯 Overview

**SofiaVoice** is an autonomous voice intelligence system engineered by **Rs4Machine** under the **RS4 Lab** experiment framework. It enables full-duplex conversational AI by listening, transcribing, reasoning, and synthesizing natural neural speech in Brazilian Portuguese with minimal end-to-end latency.

## ⚡ Key Improvements in v2.0.0

- **Asynchronous Pipeline** — Full async execution (`AsyncGroq` + `Edge-TTS`) eliminating event loop blocks.
- **Neural TTS Migration** — Replaced legacy `gTTS` with Microsoft `Edge-TTS` (FranciscaNeural), reducing audio payload sizes by **52%**.
- **Hardened Security** — Strict CORS domain mapping, 10 MB payload limits (HTTP 413), and input sanitization against XSS.
- **Session Isolation** — Independent conversation state handling per request session.

---

## ⚡ Performance Benchmarks (v1.0 vs v2.0)

| Metric / Stage | Baseline v1.0 (gTTS) | Production v2.0 (Edge-TTS) | Optimization Gain |
|---|---|---|---|
| **STT Latency (Whisper V3)** | ~0.84s | **~0.84s** | — |
| **LLM Latency (LLaMA 3.3 70B)** | ~0.70s | **~0.70s** | — |
| **TTS Engine Synthesis** | ~4.41s | **~1.60s – 2.50s** | **~40% faster** |
| **Audio Payload Size** | 64.5 KB | **30.8 KB** | **52% smaller payload** |
| **Execution Architecture** | Synchronous / Blocking | **Pure Async / Non-blocking** | Zero thread blocking |

---

## 🏗️ Architecture

```
ai-voice-assistant-groq/
├── frontend/                        → Next.js 15 (Vercel)
│   ├── app/
│   │   └── sofia-voice/
│   │       └── page.jsx             → Main orchestrator
│   ├── components/SofiaVoice/
│   │   ├── VoiceVisualizer.jsx      → State-driven animated visualizer
│   │   ├── MicButton.jsx            → Audio capture controller
│   │   ├── TerminalLog.jsx          → Terminal-style real-time logs
│   │   └── StatusBadge.jsx          → System status indicator
│   ├── hooks/
│   │   └── useSofiaVoice.js         → Web Audio API + API Client
│   └── styles/
│       └── sofia-voice.css          → Custom UI animations
│
└── backend/                         → Python 3.14 + FastAPI (Render)
    ├── main.py                      → FastAPI instance, CORS & Security middleware
    ├── config.py                    → Environment configurations
    ├── requirements.txt             → Production dependencies (Edge-TTS, AsyncGroq)
    ├── routers/
    │   └── voice.py                 → Async voice pipeline routes
    └── services/
        ├── stt.py                   → Whisper Large v3 (Groq Async Client)
        ├── llm.py                   → LLaMA 3.3 70B (Session-isolated context)
        └── tts.py                   → Edge-TTS (FranciscaNeural Engine)
```

---

## 🛠️ Tech Stack

| Layer | Technology | Specification |
|---|---|---|
| **Frontend** | Next.js 15 + React 19 | App Router + Web Audio API |
| **Styling** | CSS Modules / Tokens | Rs4Machine Design DNA System |
| **Backend** | Python 3.14.2 + FastAPI | Asynchronous ASGI execution |
| **Speech-to-Text** | Groq API | Whisper Large v3 |
| **Intelligence** | Groq API | LLaMA 3.3 70B |
| **Text-to-Speech** | Edge-TTS | Microsoft Neural Voice (pt-BR-FranciscaNeural) |
| **Deployment** | Vercel (FE) + Render (BE) | Production-ready CI/CD |

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

Interactive API documentation available at: `http://localhost:8000/docs`

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
| `POST` | `/api/transcribe` | Audio file → Text transcription | `200 OK` / `400 Bad Request` |
| `POST` | `/api/chat` | Text prompt → AI response | `200 OK` / `400 Bad Request` |
| `POST` | `/api/speak` | Text prompt → Neural Base64 audio | `200 OK` / `400 Bad Request` |
| `POST` | `/api/voice` | Full end-to-end pipeline | `200 OK` / `413 Payload Too Large` |

---

## 🤝 Contributing

Contributions, issues, and feature requests are welcome. Feel free to check the [issues page](https://github.com/raphaelmendes-dev) or open a pull request.

1. Fork the project
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 📄 License

This project is licensed under the **MIT License** — see the [LICENSE](LICENSE) file for details.

---

## 🏢 Corporate & Research Contact

**Rs4Machine** — Autonomous Agents Systems & AI Research Lab

**Founder / Lead Engineer:** Raphael Mendes

- 📧 [python.dev.raphael@gmail.com](mailto:python.dev.raphael@gmail.com)
- 🔗 GitHub: [github.com/raphaelmendes-dev](https://github.com/raphaelmendes-dev)
- 🏢 LinkedIn Company: RS4Machine Lab

<div align="center">

*SofiaVoice v2.0.0 — September 2026*

</div>