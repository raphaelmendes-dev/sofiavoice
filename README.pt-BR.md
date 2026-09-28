<div align="center">
<img src="assets/Rs4Machine.png" alt="Rs4Machine Logo" width="380" />

# 🎙️ SofiaVoice v2.0 — Rs4Machine

<img src="sofia-voice.gif" alt="Demonstração do SofiaVoice" width="100%" />

**Sistema de IA para interação por voz com baixa latência**

O SofiaVoice é um experimento público do RS4 Lab que implementa uma pipeline assíncrona STT → LLM → TTS, com tratamento de estado conversacional isolado por sessão.

[![App ao Vivo](https://img.shields.io/badge/🚀-App%20ao%20Vivo-blue?style=for-the-badge)](https://ai-voice-assistant-groq.vercel.app)
[![Documentação da API](https://img.shields.io/badge/📡-Docs%20da%20API-informational?style=for-the-badge)](https://sofia-voice-backend.onrender.com/docs)
[![GitHub](https://img.shields.io/badge/GitHub-Perfil-181717?style=for-the-badge&logo=github)](https://github.com/raphaelmendes-dev)

[![Licença](https://img.shields.io/badge/Licença-MIT-green.svg)](LICENSE)
[![Python](https://img.shields.io/badge/Python-3.14.2-blue.svg)](https://www.python.org)
[![Next.js](https://img.shields.io/badge/Next.js-15-black.svg)](https://nextjs.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-Async-009688.svg)](https://fastapi.tiangolo.com)

[🇺🇸 English](README.md) · **🇧🇷 Português do Brasil (este arquivo)**

</div>

---

## 📑 Sumário

- [Visão Geral](#-visão-geral)
- [Principais Melhorias na v2.0.0](#-principais-melhorias-na-v200)
- [Benchmarks de Performance](#-benchmarks-de-performance-v10-vs-v20)
- [Arquitetura](#️-arquitetura)
- [Stack Tecnológica](#️-stack-tecnológica)
- [Executando Localmente](#-executando-localmente)
- [Endpoints da API](#-endpoints-da-api)
- [Contribuindo](#-contribuindo)
- [Licença](#-licença)
- [Contato](#-contato)

---

## 🎯 Visão Geral

O **SofiaVoice** é um experimento de sistema de voz desenvolvido pela **Rs4Machine** dentro do **RS4 Lab**. Ele implementa uma pipeline conversacional que recebe áudio, realiza a transcrição, gera uma resposta e sintetiza voz.

A implementação pública v2.0 prioriza execução assíncrona, redução do payload de áudio, isolamento de estado por sessão e limites explícitos de API. O sistema é orientado à medição e iteração, não à autonomia opaca.

**Posicionamento oficial:** Engenheiro de Sistemas de IA focado em arquiteturas híbridas (LLM + lógica determinística) para eliminar alucinações e garantir auditabilidade em produção.

---

## ⚡ Principais Melhorias na v2.0.0

- **Pipeline Assíncrona** — Execução totalmente assíncrona (`AsyncGroq` + `Edge-TTS`) sem bloqueio do event loop.
- **Migração para TTS Neural** — Substituição do `gTTS` legado pelo `Edge-TTS` da Microsoft (FranciscaNeural), reduzindo o tamanho do payload de áudio em **52%**.
- **Segurança Reforçada** — Mapeamento estrito de domínios CORS, limite de payload de 10 MB (HTTP 413) e sanitização de entrada contra XSS.
- **Isolamento de Sessão** — Gerenciamento independente do estado da conversa por sessão de requisição.

---

## ⚡ Benchmarks de Performance (v1.0 vs v2.0)

| Métrica / Etapa | Baseline v1.0 (LLaMA 3.3 70B · gTTS) | v2.0 (openai/gpt-oss-20b · Edge-TTS) | Ganho de Otimização |
|---|---|---|---|
| **Latência STT (Whisper V3)** | ~0.84s | **~0.84s** | — |
| **Latência LLM (LLaMA 3.3 70B → openai/gpt-oss-20b)** | ~0.70s | **~0.70s** | — |
| **Síntese do Motor TTS** | ~4.41s | **~1.60s – 2.50s** | **~40% mais rápido** |
| **Tamanho do Payload de Áudio** | 64.5 KB | **30.8 KB** | **52% menor** |
| **Arquitetura de Execução** | Síncrona / Bloqueante | **Puramente assíncrona / não bloqueante** | Zero bloqueio de thread |

---

## 🏗️ Arquitetura

```text
sofiavoice/
├── frontend/                        → Next.js 15 (Vercel)
│   ├── app/sofia-voice/page.jsx     → Orquestrador principal
│   ├── components/SofiaVoice/       → Componentes da interface de voz
│   ├── hooks/useSofiaVoice.js       → Web Audio API + cliente da API
│   └── styles/                      → Animações customizadas da interface
│
└── backend/                         → Python 3.14 + FastAPI (Render)
    ├── main.py                      → Instância FastAPI, middleware de CORS e segurança
    ├── config.py                    → Configurações de ambiente
    ├── routers/voice.py              → Rotas assíncronas da pipeline de voz
    └── services/
        ├── stt.py                   → Whisper Large v3 via Groq
        ├── llm.py                   → openai/gpt-oss-20b via AsyncGroq
        └── tts.py                   → Edge-TTS (FranciscaNeural)
```

---

## 🛠️ Stack Tecnológica

| Camada | Tecnologia | Especificação |
|---|---|---|
| **Frontend** | Next.js 15 + React 19 | App Router + Web Audio API |
| **Estilização** | CSS Modules / Tokens | Sistema visual Rs4Machine |
| **Backend** | Python 3.14.2 + FastAPI | Execução ASGI assíncrona |
| **Speech-to-Text** | Groq API | Whisper Large v3 |
| **Inteligência** | Groq API | openai/gpt-oss-20b via AsyncGroq |
| **Text-to-Speech** | Edge-TTS | Voz neural da Microsoft (pt-BR-FranciscaNeural) |
| **Deploy** | Vercel (frontend) + Render (backend) | Deploy público |

---

## 🚀 Executando Localmente

### Configuração do Backend

```bash
cd backend
python -m venv .venv

# Linux/Mac
source .venv/bin/activate
# Windows
.venv\\Scripts\\activate

pip install -r requirements.txt
```

Crie um arquivo `.env` dentro de `backend/`:

```env
GROQ_API_KEY=sua_chave_da_api_groq_aqui
ALLOWED_ORIGINS=http://localhost:3000
```

Inicie o servidor assíncrono da API:

```bash
uvicorn main:app --reload --port 8000
```

Documentação interativa da API: `http://localhost:8000/docs`

### Configuração do Frontend

```bash
cd frontend
npm install
npm run dev
```

Crie um arquivo `.env.local` dentro de `frontend/`:

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
```

Acesse a aplicação em: `http://localhost:3000/sofia-voice`

---

## 📡 Endpoints da API

| Método | Rota | Descrição | Código de Status |
|---|---|---|---|
| `GET` | `/health` | Verificação operacional da API | `200 OK` |
| `POST` | `/api/transcribe` | Arquivo de áudio → transcrição de texto | `200 OK` / `400 Bad Request` |
| `POST` | `/api/chat` | Prompt de texto → resposta da IA | `200 OK` / `400 Bad Request` |
| `POST` | `/api/speak` | Prompt de texto → áudio neural em Base64 | `200 OK` / `400 Bad Request` |
| `POST` | `/api/voice` | Pipeline completo de ponta a ponta | `200 OK` / `413 Payload Too Large` |

---

## 🤝 Contribuindo

Contribuições, issues e melhorias de documentação são bem-vindas.

1. Faça um fork do projeto
2. Crie uma branch de feature (`git checkout -b feature/sua-alteracao`)
3. Faça commits seguindo [Conventional Commits](https://www.conventionalcommits.org/)
4. Envie a branch (`git push origin feature/sua-alteracao`)
5. Abra um Pull Request

---

## 📄 Licença

Este projeto está licenciado sob a **Licença MIT** — veja [LICENSE](LICENSE) para mais detalhes.

---

## 📬 Contato

**Raphael Mendes**  
**AI Systems Engineer & Founder · Rs4Machine**

- 📧 [python.dev.raphael@gmail.com](mailto:python.dev.raphael@gmail.com)
- 🔗 [LinkedIn](https://www.linkedin.com/in/raphaelmendes-dev/)
- 🌐 [Portfolio](https://portfolio-modular-rs4-machine.vercel.app/)

<div align="center">

*SofiaVoice v2.0.0 · RS4 Lab · Setembro de 2026*

</div>
