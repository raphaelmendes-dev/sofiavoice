<div align="center">

# 🔍 AUDIT_REPORT_V2 — SofiaVoice v2.0

[🇺🇸 English](AUDIT_REPORT_V2.md) · [🇧🇷 Português do Brasil (este arquivo)](AUDIT_REPORT_V2.pt-BR.md)

**Auditoria Geral de Qualidade, Segurança, Performance e Testes**

</div>

---

## 📑 Sumário

- [Resumo Executivo](#-resumo-executivo)
- [1. Escopo e Metodologia](#1-escopo-e-metodologia)
- [2. Qualidade e Limpeza de Código (Code Review)](#2-qualidade-e-limpeza-de-código-code-review)
- [3. Segurança e Blindagem](#3-segurança-e-blindagem)
- [4. Performance e Latência — v1.0 (gTTS) vs v2.0 (EdgeTTS + Groq)](#4-performance-e-latência--v10-gtts-vs-v20-edgetts--groq)
- [5. Execução de Testes](#5-execução-de-testes)
- [6. Matriz Consolidada de Achados por Severidade](#6-matriz-consolidada-de-achados-por-severidade)
- [7. Veredito Final — FASE 18](#7-veredito-final--fase-18-publicação--tag-git-v200)
- [8. Plano de Ação Recomendado](#8-plano-de-ação-recomendado-priorizado)
- [9. Anexos](#9-anexos)

---

| Campo | Valor |
|---|---|
| **Projeto** | SofiaVoice (Rs4Machine · Voice Intelligence System v2.0) |
| **Auditor** | Revisão técnica integral — QA + Segurança + Code Review |
| **Data** | 2026-09-09 |
| **Branch / Commit** | `main` · `f59469e` (13 arquivos modificados SEM commit + 4 sem tracking) |
| **Ambiente auditado** | Windows · Python 3.14.2 · FastAPI 0.141.1 · Groq 1.6.0 · Edge-TTS 7.2.8 · Next.js 15.5.12 · React 19 |
| **Cobertura** | Backend `backend/` (FastAPI) · Frontend `frontend/` (Next.js) · Docs · Logs de conversa |

---

## 📋 Resumo Executivo

| Pilar | Status | Veredito |
|---|---|---|
| Qualidade de Código | 🟠 **Regular** | Há gambiarras: duplicação legada (`src_old/`), imports mortos, mistura ES/PT/EN, sem logging estruturado. |
| Segurança e Blindagem | 🔴 **Risco Alto** | `sanitize_text()` **funciona de fato** (verificado), mas **CORS `*`**, **sem limite de 10 MB na v2.0** e **sem autenticação** deixam a API exposta. |
| Performance e Latência | 🟠 **Parcial** | LLM 0.42–1.08 s e STT ~0.84 s (excelentes via Groq); **TTS EdgeTTS 1.6–2.5 s** (NÃO mais rápido que o gTTS, 0.7–1.0 s, nessa rede) e **o event loop trava** com chamadas síncronas. |
| Execução de Testes | 🟠 **Manual, sem automação** | Não existe suite (pytest/locust/k6). Foram executados 15+ testes ao vivo, documentados abaixo. |
| Pronto para a FASE 18 (tag v2.0.0) | 🔴 **NO-GO condicionado** | Existem **5 achados críticos** e 5 de severidade alta. Ver [Veredito Final (§7)](#7-veredito-final--fase-18-publicação--tag-git-v200). |

> **Resumo em uma frase:** o produto funciona e a experiência é boa no fluxo feliz, mas a v2.0 não está blindada nem é implantável de forma limpa como está hoje (falta `edge-tts` no `requirements.txt`, o limite de 10 MB ficou preso no `src_old/`, CORS aberto). Com os bloqueadores corrigidos, está em condições de ser publicada.

---

## 1. Escopo e Metodologia

### 1.1 Arquivos revisados

- **Backend:** `main.py`, `config.py`, `routers/voice.py`, `services/{stt,llm,tts}.py`, `requirements.txt`, `render.yaml`, `src_old/*`, `.env.exemple`, logs.
- **Frontend:** `app/sofia-voice/page.jsx`, `app/layout.js`, `hooks/useSofiaVoice.js`, `components/SofiaVoice/*`, `constants/tokens.js`, `styles/sofia-voice.css`, `next.config.js`, `package.json`.
- **Docs:** `README.md`, `README.en.md`, `docs/ARCHITECTURE.md`, `docs/STREAMING_V3_PLAN.md`.

### 1.2 Testes executados ao vivo

1. Compilação estática de todo o backend (`py_compile`) → **OK**.
2. Inicialização real do `uvicorn main:app` e bateria HTTP sobre `/api/chat`, `/api/speak`, `/api/transcribe`, `/api/voice`, `/health` e preflight de CORS.
3. Teste de **payload de 11 MB** (verifica a trava de 10 MB).
4. Teste de **injeção HTML/script + prompt injection** (verifica `sanitize_text`).
5. Teste de **concorrência** (5 requisições simultâneas) para detectar bloqueio do event loop.
6. **Benchmark de TTS local**: gTTS (v1.0) vs EdgeTTS (v2.0), mesma máquina e texto.
7. **Build completo de Next.js** em produção (`npm run build`) → compila e passa no lint.

---

## 2. Qualidade e Limpeza de Código (Code Review)

### 2.1 Backend (FastAPI)

| ID | Achado | Arquivo | Severidade |
|---|---|---|---|
| QC-01 | **Dependência viva não declarada:** o código importa `edge_tts`, mas o `requirements.txt` lista `gTTS` (que não é mais usado). Um deploy limpo quebra com `ImportError` na inicialização. | `requirements.txt` / `services/tts.py` | 🔴 Crítico |
| QC-02 | **Import morto:** `from urllib import response` não é usado. | `services/llm.py:3` | 🟡 Média |
| QC-03 | **Chamadas síncronas bloqueantes dentro de `async def`:** `stt.transcribe()` e `llm.chat()` são síncronas (rede) e invocadas diretamente em corrotinas → bloqueiam todo o event loop. Medido: 5 requisições concorrentes foram serializadas (wall time 3.69 s). | `routers/voice.py:47,71,111,121` | 🔴 Crítico (perf) |
| QC-04 | **Handler de erro que quebra:** o `except` de `STTService` faz `print("❌ …")`; no Windows (CP1252) o emoji provoca `UnicodeEncodeError` → o endpoint devolve **500** em vez do fallback elegante. Reproduzido ao vivo com o payload de 11 MB. | `services/stt.py:29` (mesmo padrão em `llm.py:54` e `tts.py:37`) | 🟠 Alta |
| QC-05 | **Estado global compartilhado entre usuários:** `llm = LLMService()` é instanciado no nível do módulo e `self.history` é compartilhado por **todas** as requisições → vazamento de contexto entre sessões (privacidade). O próprio `STREAMING_V3_PLAN.md` proíbe isso para a v3. | `routers/voice.py:11-13` / `services/llm.py:15` | 🟠 Alta |
| QC-06 | **Código duplicado/órfão:** `backend/src_old/main.py` mantém o sanitizer + limite de 10 MB + CORS restrito que **não são mais aplicados** na v2.0. Risco de editar o arquivo errado. | `backend/src_old/` | 🟡 Média |
| QC-07 | **Sem logging estruturado:** tudo é `print()`; erros externos do Groq são impressos por inteiro, sem contexto nem nível. | `services/*.py` | 🟡 Média |
| QC-08 | **Contratos inconsistentes:** `/api/voice` não valida `content_type` nem arquivo vazio (diferente de `/api/transcribe`), não tem tratamento de erro próprio e pode devolver `audio_base64` vazio com HTTP 200 se o TTS falhar; as respostas do LLM não são sanitizadas antes de devolver/sintetizar. | `routers/voice.py:98-142` | 🟡 Média |

### 2.2 Frontend (Next.js)

| ID | Achado | Arquivo | Severidade |
|---|---|---|---|
| QC-09 | **APIs experimentais do Chrome:** `navigator.mediaDevices.getUserMedia`, `new MediaRecorder(stream,…)`, `audioContext.createAnalyser()`, `createMediaStreamSource()`, `new Audio(src)` — nenhuma delas é padrão multiplataforma; só funciona em Chrome recente, sem fallback para Firefox/Safari. | `hooks/useSofiaVoice.js:129-142,257` | 🟠 Alta (portabilidade) |
| QC-10 | **Sem automação de qualidade:** não há testes unitários/E2E, nem lint/typecheck dedicado, nem CI. O build passa apenas pelo mini-lint embutido do Next. | `package.json` | 🟡 Média |
| QC-11 | **Rótulos desatualizados:** o rodapé diz `gTTS:active` quando a v2.0 usa **EdgeTTS**; strings misturam ES/PT ("PUSH TO TALK" vs "Desativar microfone"). | `app/sofia-voice/page.jsx:143` | 🟢 Baixa |
| QC-12 | **Estilo inline massivo:** o orquestrador e os componentes carregam dezenas de objetos `style={{…}}`; o CSS global só tem keyframes. Manutenibilidade média-baixa. | `page.jsx`, `TerminalLog.jsx`, etc. | 🟢 Baixa |
| QC-13 | **Dependências mínimas e saudáveis:** apenas `next/react/react-dom`; sem pacotes de terceiros em runtime (ponto positivo). | `package.json` | ✅ Positivo |

---

## 3. Segurança e Blindagem

### 3.1 `sanitize_text()` — ✅ Operacional (parcial)

`routers/voice.py:16-24` remove tags `<...>` e caracteres de controle, e limita a 2000 caracteres. **Teste real:** o payload com `<script>alert(1)</script><img src=x onerror=alert(2)>` chegou ao log sem nenhuma tag.

**Limitações:**

- Cobre apenas a **entrada**. A **saída do LLM não é sanitizada** antes de ser devolvida ou sintetizada → um modelo manipulado poderia emitir HTML/instruções indesejadas (risco baixo, mas existe).
- Não há sanitização sobre os **logs persistidos** além da entrada já limpa (em `/api/voice` a resposta crua do modelo passa direto).

### 3.2 CORS — 🔴 NÃO restringido

`backend/main.py:12-17` usa `allow_origins=["*"]` com `allow_methods=["*"]`. **Preflight real:**

```
OPTIONS /api/chat · Origin: http://evil.com
HTTP/1.1 200 OK
access-control-allow-origin: *
access-control-allow-methods: DELETE, GET, HEAD, OPTIONS, PATCH, POST, PUT
```

A versão "restringida" vive apenas em `src_old/main.py` ("14.2 — CORS Restrito ao Frontend", `localhost:3000`). **A trava de CORS NÃO está operativa na v2.0:** qualquer site pode chamar a API a partir do navegador de uma vítima e queimar créditos do Groq.

### 3.3 Trava de payload de 10 MB — 🔴 NÃO operativa

O middleware `limit_payload_size` (HTTP 413 para >10 MB) existe **apenas em `backend/src_old/main.py`**; **não está em `backend/main.py` nem nos routers da v2.0**.

**Teste real:** upload de 11 MB para `/api/transcribe` → **sem 413** (terminou em 500 pelo bug QC-04). Um atacante pode subir arquivos enormes e esgotar a memória do worker (DoS). Aplica-se também a `/api/chat` e `/api/speak` (o JSON é lido por inteiro na memória antes de ser truncado a 2000 caracteres pelo `sanitize_text`).

### 3.4 Outros achados de segurança

| ID | Achado | Detalhe | Severidade |
|---|---|---|---|
| S-01 | **Sem autenticação nem rate limit** em nenhum endpoint → abuso direto da API key do Groq (custo) e spam. | — | 🔴 Crítico (com domínio público) |
| S-02 | **Vazamento de contexto entre usuários** por `LLMService.history` ser global (QC-05) → privacidade. | `services/llm.py:15` | 🟠 Alta |
| S-03 | **Sem timeout no cliente Groq** → uma chamada travada deixa a conexão aberta indefinidamente (DoS simples e má UX). | `services/llm.py:38` / `stt.py:16` | 🟠 Alta |
| S-04 | **Erros externos impressos sem filtro** (trace completo do Groq no stdout via `print`) e 500 planos para o cliente (reproduzido com 11 MB). | `stt.py` / `voice.py` | 🟡 Média |
| S-05 | `.env` corretamente ignorado; **nenhuma credencial commitada foi encontrada**. | `.gitignore` | ✅ Positivo |
| S-06 | Arquivos de lixo na raiz sem tracking (`teste.txt`) e `logs/` duplicado na raiz vs `backend/logs/` → ruído e possível exposição de conversas no repositório. | raiz | 🟢 Baixa |

---

## 4. Performance e Latência — v1.0 (gTTS) vs v2.0 (EdgeTTS + Groq)

### 4.1 Medição empírica local (2026-09-09)

| Etapa | v1.0 (baseline) | v2.0 medido | Fonte |
|---|---|---|---|
| STT (Whisper large-v3 via Groq) | ~0.4–0.7 s (documentado) | **0.835 s** | log do servidor `[LATÊNCIA - STT]` |
| LLM (Groq) | — (apenas 1 round-trip) | **0.42–1.08 s** (3 amostras: 0.416 / 0.703 / 1.078) | log do servidor `[LATÊNCIA - LLM]` |
| Síntese TTS (gTTS vs EdgeTTS, mesmo texto) | **0.70–1.01 s** (média ~0.85 s) | **1.62–2.51 s** (média ~2.0 s) | benchmark local + `/api/speak` |
| Tamanho do MP3 gerado | 64.5 KB (gTTS) | **30.8 KB (EdgeTTS)** → **−52%** | benchmark local |
| Pipeline completo `/api/voice` | — | **2.94 s** (áudio falso de 1 s) | curl |
| Pipeline de 3 POST (frontend) | — | **≈ 3.8–4.4 s** (0.84 + 0.4–1.1 + 2.5) | soma das medições |

**Leitura honesta do benchmark de TTS:**

- Nessa rede, o **EdgeTTS foi MAIS lento que o gTTS** na síntese bruta (~2.0 s vs ~0.85 s de média).
- Porém, o áudio do EdgeTTS pesa **a metade** (30.8 KB vs 64.5 KB): a transferência para o navegador e o decode são mais rápidos, e a voz neural (`pt-BR-FranciscaNeural`) é mais natural.
- A queda real de latência da v2.0 vem do **Groq** (Whisper + LLM em uma única passada de rede, TTFB do LLM ~0.4 s) e da eliminação do desvio pelo ElevenLabs de versões intermediárias. O objetivo da v3.0 (≤300 ms de TTFB com streaming) segue pendente e corretamente planejado em `docs/STREAMING_V3_PLAN.md`.

### 4.2 Gargalo medido: event loop bloqueado 🧨

Teste com **5 requisições `/api/chat` concorrentes**:

| Métrica | Resultado |
|---|---|
| Duração individual | 1.00 / 1.52 / 2.63 / 3.25 / 3.69 s |
| **Wall time total** | **3.69 s** (≈ serialização: cada requisição espera a anterior) |
| Com um worker e endpoints `async def` chamando `llm.chat()` de forma síncrona | O servidor NÃO consegue atender 2 requisições ao mesmo tempo |

**Conclusão:** sob carga real (2+ usuários), a latência degrada linearmente. É preciso mover as chamadas ao Groq/EdgeTTS para `run_in_executor`/`AsyncGroq`, ou usar `def` (o FastAPI as executa em threadpool) — por exemplo, o `while` do TTS já é `await`, mas `transcribe` e `chat` não são.

---

## 5. Execução de Testes

> Não existem scripts de carga/segurança (PowerShell/Python) nem suite `pytest` no repositório. Foram executados testes reais contra o servidor rodando localmente (`uvicorn main:app --port 8010`).

### 5.1 Bateria HTTP ao vivo

| # | Teste | Resultado | Código | Tempo |
|---|---|---|---|---|
| 1 | `GET /health` | `{"status":"ok","version":"2.0.0"}` | 200 | instantâneo |
| 2 | `OPTIONS /api/chat` · Origin `http://evil.com` | **CORS aberto (`allow-origin: *`)** | 200 | — |
| 3 | `POST /api/chat` mensagem normal | Resposta correta em PT | 200 | 0.72 s (LLM 0.703 s) |
| 4 | `POST /api/chat` injeção `<script>`/`<img onerror>` | Tags **removidas** (verificado no log) + LLM recusou o pedido | 200 | 0.44 s |
| 5 | `POST /api/chat` mensagem vazia | `"Mensagem não pode ser vazia…"` | **400** | — |
| 6 | `POST /api/chat` 5000 caracteres | Aceito (truncado a 2000 pelo `sanitize_text`) | 200 | 1.08 s |
| 7 | `POST /api/speak` texto válido | MP3 base64 (41.088 chars) · `latency_seconds: 2.513` | 200 | 2.52 s |
| 8 | `POST /api/speak` texto vazio | `"Texto não pode ser vazio…"` | **400** | — |
| 9 | `POST /api/transcribe` content-type `octet-stream` | `"Envie um arquivo de áudio."` | **400** | — |
| 10 | `POST /api/transcribe` WAV de silêncio (1 s) | **Whisper alucinou** `"Apenas o que você quer."` (falta VAD/validação) | 200 | 0.84 s |
| 11 | `POST /api/transcribe` **11 MB** | **Sem 413** → `UnicodeEncodeError` no `except` → **500** | 500 | 12.7 s |
| 12 | `POST /api/voice` pipeline completo (WAV falso) | JSON com `user_text` + `ai_response` + `audio_base64` | 200 | 2.94 s |
| 13 | 5 × `POST /api/chat` concorrentes | **Serialização do event loop** (wall time 3.69 s) | 200 | ver §4.2 |
| 14 | `python -m py_compile` (todo o backend) | **OK** | — | — |
| 15 | `npm run build` (Next.js produção) | **Compila + lint OK** · First Load JS 108 kB | — | — |
| 16 | Benchmark TTS local ×2 (gTTS / EdgeTTS) | 0.70–1.01 s / 1.62–1.96 s; 64.5 KB / 30.8 KB | — | — |

### 5.2 Evidência de logs do servidor (trecho)

```
[LATÊNCIA - LLM (Groq)]:    0.703s
[LATÊNCIA - LLM (Groq)]:    0.416s
[LATÊNCIA - LLM (Groq)]:    1.078s
[LATÊNCIA - TTS (EdgeTTS)]: 2.513s
[LATÊNCIA - STT (Whisper)]: 0.835s
POST /api/transcribe HTTP/1.1" 500 Internal Server Error   ← UnicodeEncodeError (CP1252)
```

---

## 6. Matriz Consolidada de Achados por Severidade

| Severidade | IDs | Contagem |
|---|---|---|
| 🔴 **Crítico (bloqueia release)** | QC-01 (edge-tts ausente no `requirements.txt`) · QC-03 (event loop bloqueado) · S-01 (sem auth/rate limit) · CORS `*` (S-00) · Trava de 10 MB ausente (S-00) | 5 |
| 🟠 **Alta** | QC-04 (except quebra no Windows) · QC-05 (histórico global) · QC-09 (APIs experimentais do Chrome) · S-02 · S-03 | 5 |
| 🟡 **Média** | QC-02 · QC-06 · QC-07 · QC-08 · QC-10 · S-04 | 6 |
| 🟢 **Baixa** | QC-11 · QC-12 · S-06 · docs desatualizados (README/ARCHITECTURE) · falta `.env.exemple` em `backend/` | 5 |
| ✅ **Positivos** | QC-13 (deps mínimas) · S-05 (sem segredos no git) · `sanitize_text` operativo · build Next OK · validação 400 em chat/speak | 5 |

---

## 7. Veredito Final — FASE 18 (Publicação / Tag Git v2.0.0)

### ✅ Prós (o que está pronto para publicar)

1. **O fluxo feliz funciona de ponta a ponta** e o HUD de métricas (STT/LLM/TTS/TOTAL) é real, medido e visível no frontend.
2. **Sanitização de entrada operativa e verificada** (tags HTML removidas em teste real).
3. **Sem credenciais commitadas**; `.env` ignorado; dependências de runtime do frontend mínimas (apenas Next/React).
4. **Build de produção do Next.js sem erros** (compile + lint + rotas estáticas OK).
5. **Código do backend compacto e legível** na camada de serviços; a separação `routers/services` é correta.
6. **Plano v3.0 bem documentado** (`STREAMING_V3_PLAN.md`): o próximo passo arquitetural está claro e coerente com os achados desta auditoria (sessões, async, buffer).

### ❌ Contras (o que impede declarar a v2.0.0 hoje)

1. **`requirements.txt` está quebrado para deploy limpo** (falta `edge-tts`; sobra `gTTS`) → no Render/CI a inicialização falha.
2. **CORS aberto para `*`** com **API sem autenticação nem rate limit** → qualquer um pode queimar o orçamento do Groq e ler/alterar o contexto global do bot.
3. **A trava de 10 MB não existe no código da v2.0** (ficou no `src_old/`) → vetor de DoS por memória (verificado: 11 MB não geram 413).
4. **Concorrência nula**: uma única requisição bloqueia o servidor (medido) → mau comportamento com 2+ usuários.
5. **Bug de encoding nos `except`** quebra o tratamento de erros no Windows (`500` em vez de fallback) — o próprio ambiente de desenvolvimento do autor é afetado.
6. **Estado do histórico do LLM é global** → vazamento de privacidade entre usuários.
7. **Zero automação de testes** (sem pytest, sem scripts de carga/segurança, sem CI): a "garantia de qualidade" é manual.
8. **Docs desatualizados** (README/ARCHITECTURE dizem gTTS/LLaMA 3.3 70B/Railway; o rodapé do frontend diz `gTTS:active`) → contradizem o código da v2.0.
9. **Frontend preso ao Chrome** por APIs experimentais → não é multiplataforma na prática.

### 🎯 Veredito

> ## 🔴 **NO-GO condicionado para a tag `v2.0.0`**
> O estado atual da `main` + mudanças sem commit **não deve** ser marcado como v2.0.0 publicado em ambiente público. Com a correção dos **5 críticos** (ou pelo menos os 3 estruturais: `requirements.txt`, CORS/payload em `main.py`, async nos routers) e uma rodada de testes automatizados, a FASE 18 está a **poucas horas de trabalho**. Enquanto isso, recomenda-se **manter a v2.0 como tag interna `v2.0.0-rc.1`** no git local.

---

## 8. Plano de Ação Recomendado (priorizado)

| # | Ação | Esforço | Impacto |
|---|---|---|---|
| 1 | Adicionar `edge-tts` e versionar dependências (`requirements.txt` com pins ou `uv.lock`); remover `gTTS`. | Baixo | Elimina o bloqueador de deploy |
| 2 | Restaurar em `backend/main.py` o **middleware de payload (10 MB → 413)** e restringir o **CORS** às origens reais (Vercel + localhost + domínio próprio). | Baixo | Fecha 2 vetores críticos |
| 3 | Tornar assíncrono de verdade: `AsyncGroq` (`groq.AsyncGroq`) ou `run_in_executor`, com `await` nos routers. | Médio | Concorrência real |
| 4 | Substituir `print("❌…")` por `logging` com `errors="replace"`/UTF-8 seguro; centralizar tratamentos de exceção que devolvam JSON limpo. | Baixo | Robustez multiplataforma |
| 5 | Mover `self.history` para um `session_id` por usuário (ou adiar o redesenho para a v3.0) e adicionar **rate limiting** básico (slowapi/limits) + autenticação mínima por API key. | Médio | Privacidade e economia |
| 6 | Remover `src_old/` ou marcá-lo como pasta congelada; apagar `teste.txt`; unificar `logs/` (raiz vs backend). | Baixo | Higiene do repositório |
| 7 | Adicionar suite mínima: `pytest` para `sanitize_text` + endpoints (TestClient), e um script de carga (locust/k6) reaproveitando os casos desta auditoria. | Médio | QA reproduzível |
| 8 | Atualizar README/ARCHITECTURE/rodapé para EdgeTTS + gpt-oss-20b + Render; deixar `.env.exemple` dentro de `backend/`. | Baixo | Coerência de marca |
| 9 | Commitar/limpar a árvore: há **13 arquivos modificados + 4 sem tracking** sem commit; perde-se rastreabilidade para o release. | Baixo | Governança |

---

## 9. Anexos

- **Artefatos da auditoria:** todos os arquivos temporários de teste (payloads, binários de 11 MB, logs do servidor, script de concorrência, `.next/`) foram **excluídos** após a execução; a árvore git ficou exatamente como estava.
- **Nota metodológica:** os tempos de TTS dependem de rede e provedor; o benchmark local usou o mesmo texto e a mesma máquina para gTTS e EdgeTTS.
- **Documento vivo:** este relatório deve ser reexecutado (`AUDIT_REPORT_V2.md`) ao fechar os críticos e antes da tag definitiva.

---

<div align="center">

*Auditoria realizada em 09/09/2026 · SofiaVoice v2.0 · Rs4Machine — Fim do relatório.*

</div>