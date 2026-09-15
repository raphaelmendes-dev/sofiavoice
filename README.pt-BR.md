<div align="center">
<img src="assets/Rs4Machine.png" alt="Rs4Machine Logo" width="380" />

# 🎙️ SofiaVoice — Rs4Machine

<img src="sofia-voice.gif" alt="Demonstração do SofiaVoice" width="100%" />

**Sistema de Inteligência de Voz v2.0.0**

Assistente de voz com IA de nível produção — ouve, compreende e responde em tempo real com baixa latência.

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
- [Contato Corporativo & Pesquisa](#-contato-corporativo--pesquisa)

---

## 🎯 Visão Geral

**SofiaVoice** é um sistema autônomo de inteligência de voz desenvolvido pela **Rs4Machine** dentro do framework de experimentos **RS4 Lab**. Ele viabiliza uma IA conversacional full-duplex — ouvindo, transcrevendo, raciocinando e sintetizando fala neural natural em Português do Brasil com latência mínima de ponta a ponta.

## ⚡ Principais Melhorias na v2.0.0

- **Pipeline Assíncrono** — Execução totalmente assíncrona (`AsyncGroq` + `Edge-TTS`), eliminando bloqueios no event loop.
- **Migração para TTS Neural** — Substituição do `gTTS` legado pelo `Edge-TTS` da Microsoft (FranciscaNeural), reduzindo o tamanho do payload de áudio em **52%**.
- **Segurança Reforçada** — Mapeamento estrito de domínios CORS, limite de payload de 10 MB (HTTP 413) e sanitização de entrada contra XSS.
- **Isolamento de Sessão** — Gerenciamento independente do estado da conversa por requisição.

---

## ⚡ Benchmarks de Performance (v1.0 vs v2.0)

| Métrica / Etapa | Baseline v1.0 (LLaMA 3.3 70B · gTTS) | Produção v2.0 (openai/gpt-oss-20b · Edge-TTS) | Ganho de Otimização |
|---|---|---|---|
| **Latência STT (Whisper V3)** | ~0.84s | **~0.84s** | — |
| **Latência LLM (LLaMA 3.3 70B → openai/gpt-oss-20b)** | ~0.70s | **~0.70s** | — |
| **Síntese do Motor TTS** | ~4.41s | **~1.60s – 2.50s** | **~40% mais rápido** |
| **Tamanho do Payload de Áudio** | 64.5 KB | **30.8 KB** | **52% menor** |
| **Arquitetura de Execução** | Síncrona / Bloqueante | **Puramente Assíncrona** | Zero bloqueio de thread |

---

## 🏗️ Arquitetura

```
ai-voice-assistant-groq/
├── frontend/                        → Next.js 15 (Vercel)
│   ├── app/
│   │   └── sofia-voice/
│   │       └── page.jsx             → Orquestrador principal
│   ├── components/SofiaVoice/
│   │   ├── VoiceVisualizer.jsx      → Visualizador animado orientado a estado
│   │   ├── MicButton.jsx            → Controlador de captura de áudio
│   │   ├── TerminalLog.jsx          → Logs em tempo real estilo terminal
│   │   └── StatusBadge.jsx          → Indicador de status do sistema
│   ├── hooks/
│   │   └── useSofiaVoice.js         → Web Audio API + Cliente da API
│   └── styles/
│       └── sofia-voice.css          → Animações customizadas de UI
│
└── backend/                         → Python 3.14 + FastAPI (Render)
    ├── main.py                      → Instância FastAPI, middleware de CORS & segurança
    ├── config.py                    → Configurações de ambiente
    ├── requirements.txt             → Dependências de produção (Edge-TTS, AsyncGroq)
    ├── routers/
    │   └── voice.py                 → Rotas assíncronas do pipeline de voz
    └── services/
        ├── stt.py                   → Whisper Large v3 (Cliente Assíncrono Groq)
        ├── llm.py                   → openai/gpt-oss-20b via AsyncGroq (Contexto isolado por sessão)
        └── tts.py                   → Edge-TTS (Motor FranciscaNeural)
```

---

## 🛠️ Stack Tecnológica

| Camada | Tecnologia | Especificação |
|---|---|---|
| **Frontend** | Next.js 15 + React 19 | App Router + Web Audio API |
| **Estilização** | CSS Modules / Tokens | Rs4Machine Design DNA System |
| **Backend** | Python 3.14.2 + FastAPI | Execução ASGI assíncrona |
| **Speech-to-Text** | Groq API | Whisper Large v3 |
| **Inteligência** | Groq API | openai/gpt-oss-20b (via AsyncGroq) |
| **Text-to-Speech** | Edge-TTS | Voz Neural Microsoft (pt-BR-FranciscaNeural) |
| **Deploy** | Vercel (FE) + Render (BE) | CI/CD pronto para produção |

---

## 🚀 Executando Localmente

### Configuração do Backend

```bash
cd backend
python -m venv .venv

# Linux/Mac
source .venv/bin/activate
# Windows
.venv\Scripts\activate

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

Documentação interativa da API disponível em: `http://localhost:8000/docs`

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
| `POST` | `/api/transcribe` | Arquivo de áudio → Transcrição de texto | `200 OK` / `400 Bad Request` |
| `POST` | `/api/chat` | Prompt de texto → Resposta da IA | `200 OK` / `400 Bad Request` |
| `POST` | `/api/speak` | Prompt de texto → Áudio Base64 neural | `200 OK` / `400 Bad Request` |
| `POST` | `/api/voice` | Pipeline completo de ponta a ponta | `200 OK` / `413 Payload Too Large` |

---

## 🤝 Contribuindo

Contribuições, issues e sugestões de funcionalidades são bem-vindas. Confira a [página de issues](https://github.com/raphaelmendes-dev) ou abra um pull request.

1. Faça um fork do projeto
2. Crie sua branch de feature (`git checkout -b feature/minha-feature`)
3. Faça o commit das suas alterações (`git commit -m 'Adiciona feature incrível'`)
4. Envie para a branch (`git push origin feature/minha-feature`)
5. Abra um Pull Request

---

## 📄 Licença

Este projeto está licenciado sob a **Licença MIT** — veja o arquivo [LICENSE](LICENSE) para mais detalhes.

---

## 🏢 Contato Corporativo & Pesquisa

**Rs4Machine** — Laboratório de Pesquisa em IA e Sistemas de Agentes Autônomos

**Fundador / Engenheiro Líder:** Raphael Mendes

- 📧 [python.dev.raphael@gmail.com](mailto:python.dev.raphael@gmail.com)
- 🔗 GitHub: [github.com/raphaelmendes-dev](https://github.com/raphaelmendes-dev)
- 🏢 Empresa no LinkedIn: RS4Machine Lab

<div align="center">

*SofiaVoice v2.0.0 — Setembro de 2026*

</div>