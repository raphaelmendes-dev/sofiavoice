# Architecture
 
## Diagrama
 
O diagrama de arquitetura está disponível em:
 
```
docs/architecture.excalidraw
```
 
---
 
## Visão Geral
 
SofiaVoice é uma aplicação de assistente de voz composta por um backend FastAPI e um frontend Next.js. O backend orquestra um pipeline linear de três serviços independentes — STT, LLM e TTS — que processam áudio de entrada e retornam áudio de saída.
 
**Pipeline:**
 
```
ÁUDIO ENTRADA → STT → LLM → TTS → ÁUDIO SAÍDA
```
 
---
 
## Componentes
 
### Backend — FastAPI
 
Ponto de entrada da aplicação. Recebe requisições HTTP do frontend, aciona os serviços em sequência e retorna o resultado.
 
| Atributo | Valor |
|---|---|
| Framework | FastAPI |
| Linguagem | Python |
| Deploy | Railway |
| Responsabilidade | Orquestração do pipeline STT → LLM → TTS |
 
**Estrutura de arquivos:**
 
```
backend/
├── main.py
├── routers/
│   └── voice.py
└── services/
    ├── stt.py
    ├── llm.py
    └── tts.py
```
 
---
 
### STT — Speech-to-Text
 
Recebe o arquivo de áudio enviado pelo frontend e retorna o texto transcrito.
 
| Atributo | Valor |
|---|---|
| Provider | Groq API |
| Modelo | Whisper Large V3 |
| Input | Arquivo de áudio |
| Output | Texto transcrito |
 
---
 
### LLM — Large Language Model
 
Recebe o texto transcrito pelo STT e retorna a resposta em texto.
 
| Atributo | Valor |
|---|---|
| Provider | Groq API |
| Modelo | openai/gpt-oss-20b |
| Input | Texto transcrito |
| Output | Texto da resposta |
 
---
 
### TTS — Text-to-Speech
 
Recebe o texto de resposta do LLM e retorna o áudio sintetizado.
 
| Atributo | Valor |
|---|---|
| Engine | gTTS |
| Formato de saída | MP3 |
| Input | Texto da resposta |
| Output | Áudio MP3 convertido para Base64 |
 
---
 
### Frontend
 
Responsável pela interação com o usuário: captura o áudio do microfone, envia ao backend e reproduz o áudio de resposta recebido.
 
| Atributo | Valor |
|---|---|
| Framework | Next.js |
| Deploy | Vercel |
| Responsabilidade | Captura de áudio · Envio ao backend · Reprodução da resposta |
 
> **Status:** integração frontend ↔ backend ainda não validada ponta a ponta. Pipeline backend testado localmente via Swagger.
 
---
 
## Fluxo de Dados
 
```
1. Frontend captura o áudio do usuário
2. Frontend envia o áudio ao backend via POST /api/voice
3. Backend aciona stt.py → texto transcrito
4. Backend aciona llm.py com o texto → texto de resposta
5. Backend aciona tts.py com a resposta → áudio MP3 convertido para Base64
6. Backend retorna JSON ao frontend:
   {
     "user_text":    "<texto transcrito>",
     "ai_response":  "<texto da resposta>",
     "audio_base64": "<áudio MP3 em Base64>",
     "format":       "mp3"
   }
7. Frontend decodifica o Base64 e reproduz o áudio
```
 
> **Status de validação:** o backend e o pipeline `POST /api/voice` foram testados com sucesso localmente via Swagger. A integração completa com o frontend será validada na próxima etapa do projeto.
 
---
 
## Stack
 
| Camada | Tecnologia |
|---|---|
| Backend | FastAPI · Python |
| STT | Groq API · Whisper Large V3 |
| LLM | Groq API · openai/gpt-oss-20b |
| TTS | gTTS |
| Formato de áudio de saída | MP3 |
| Frontend | Next.js |
| Deploy backend | Railway |
| Deploy frontend | Vercel |
 
---
 
## Arquitetura Atual vs. Futuras Melhorias
 
Esta seção diferencia o que está implementado do que ainda não existe.
 
### Implementado
 
- Pipeline linear STT → LLM → TTS via FastAPI
- Transcrição com Whisper Large V3 via Groq
- Geração de resposta com openai/gpt-oss-20b via Groq
- Síntese de voz com gTTS em MP3
- Resposta do endpoint em JSON com `user_text`, `ai_response`, `audio_base64` e `format`
- Pipeline validado localmente via Swagger
- Frontend Next.js implementado (integração ponta a ponta pendente de validação)
- Deploy em Railway (backend) e Vercel (frontend)
### Não implementado (registro para decisões futuras)
 
> Esta seção deve ser preenchida conforme decisões de roadmap forem tomadas. Nenhuma melhoria foi documentada no texto de origem.