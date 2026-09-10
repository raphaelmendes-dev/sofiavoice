# 🔍 AUDIT_REPORT_V2 — SofíaVoice v2.0

**Auditoría General de Calidad, Seguridad, Performance y Testeo**

| Campo | Valor |
|---|---|
| **Proyecto** | SofiaVoice (Rs4Machine · Voice Intelligence System v2.0) |
| **Auditor** | Revisión técnica integral — QA + Seguridad + Code Review |
| **Fecha** | 2026-09-09 |
| **Rama / Commit** | `main` · `f59469e` (con 13 archivos modificados SIN commitear + 4 sin trackear) |
| **Entorno auditado** | Windows · Python 3.14.2 · FastAPI 0.141.1 · Groq 1.6.0 · Edge-TTS 7.2.8 · Next.js 15.5.12 · React 19 |
| **Cobertura** | Backend `backend/` (FastAPI) · Frontend `frontend/` (Next.js) · Docs · Logs de conversación |

---

## 📋 Resumen Ejecutivo

| Pilar | Estado | Veredicto |
|---|---|---|
| Calidad de Código | 🟠 **Regular** | Hay gambiarras: duplicación legacy (`src_old/`), imports muertos, mezcla ES/PT/EN, sin logging estructurado. |
| Seguridad y Blindaje | 🔴 **Riesgo Alto** | `sanitize_text()` **sí funciona** (verificado), pero **CORS `*`**, **sin límite de 10 MB en v2.0** y **sin autenticación** dejan la API expuesta. |
| Performance y Latencia | 🟠 **Parcial** | LLM 0.42–1.08 s y STT ~0.84 s (excelentes vía Groq); **TTS EdgeTTS 1.6–2.5 s** (NO más rápido que gTTS 0.7–1.0 s en esa red) y **el event loop se bloquea** con llamadas síncronas. |
| Ejecución de Pruebas | 🟠 **Manual, sin automatización** | No existe suite (pytest/locust/k6). Se ejecutaron 15+ pruebas en vivo documentadas abajo. |
| Listo para FASE 18 (tag v2.0.0) | 🔴 **NO-GO condicionado** | Existen **5 hallazgos críticos** y 5 de severidad alta. Ver [Veredicto Final (§7)](#7-veredicto-final). |

> **Frase corta:** el producto funciona y la experiencia es buena en el flujo feliz, pero v2.0 no está blindada ni es desplenable de forma limpia tal cual está hoy (falta `edge-tts` en `requirements.txt`, el límite de 10 MB quedó en `src_old/`, CORS abierto). Con los bloqueantes corregidos, está en condiciones de publicarse.

---

## 1. Alcance y Metodología

### 1.1 Archivos revisados
- **Backend:** `main.py`, `config.py`, `routers/voice.py`, `services/{stt,llm,tts}.py`, `requirements.txt`, `render.yaml`, `src_old/*`, `.env.exemple`, logs.
- **Frontend:** `app/sofia-voice/page.jsx`, `app/layout.js`, `hooks/useSofiaVoice.js`, `components/SofiaVoice/*`, `constants/tokens.js`, `styles/sofia-voice.css`, `next.config.js`, `package.json`.
- **Docs:** `README.md`, `README.en.md`, `docs/ARCHITECTURE.md`, `docs/STREAMING_V3_PLAN.md`.

### 1.2 Pruebas ejecutadas en vivo
1. Compilación estática de todo el backend (`py_compile`) → **OK**.
2. Arranque real de `uvicorn main:app` y batería HTTP sobre `/api/chat`, `/api/speak`, `/api/transcribe`, `/api/voice`, `/health` y preflight CORS.
3. Prueba de **payload de 11 MB** (verifica la traba de 10 MB).
4. Prueba de **inyección HTML/script + prompt injection** (verifica `sanitize_text`).
5. Prueba de **concurrencia** (5 peticiones simultáneas) para detectar bloqueo del event loop.
6. **Benchmark TTS local**: gTTS (v1.0) vs EdgeTTS (v2.0), misma máquina y texto.
7. **Build completo de Next.js** en producción (`npm run build`) → compila y pasa lint.

---

## 2. Calidad y Limpieza de Código (Code Review)

### 2.1 Backend (FastAPI)

| ID | Hallazgo | Archivo | Severidad |
|---|---|---|---|
| QC-01 | **Dependencia viva sin declarar:** el código importa `edge_tts`, pero `requirements.txt` lista `gTTS` (que ya no se usa). Un deploy limpio rompe con `ImportError` al arrancar. | `requirements.txt` / `services/tts.py` | 🔴 Crítico |
| QC-02 | **Import muerto:** `from urllib import response` no se usa. | `services/llm.py:3` | 🟡 Media |
| QC-03 | **Llamadas síncronas bloqueantes dentro de `async def`:** `stt.transcribe()` y `llm.chat()` son síncronos (red) e invocados directo en corrutinas → bloquean todo el event loop. Medido: 5 peticiones concurrentes se serializaron (wall 3.69 s). | `routers/voice.py:47,71,111,121` | 🔴 Crítico (perf) |
| QC-04 | **Manejador de errores que revienta:** el `except` de `STTService` hace `print("❌ …")`; en Windows (CP1252) el emoji provoca `UnicodeEncodeError` → el endpoint devuelve **500** en vez del fallback elegante. Reproducido en vivo con el payload de 11 MB. | `services/stt.py:29` (mismo patrón en `llm.py:54` y `tts.py:37`) | 🟠 Alto |
| QC-05 | **Estado global compartido entre usuarios:** `llm = LLMService()` se instancia a nivel de módulo y `self.history` es compartido por **todos** los requests → fuga de contexto entre sesiones (privacidad). El propio `STREAMING_V3_PLAN.md` lo prohíbe para v3. | `routers/voice.py:11-13` / `services/llm.py:15` | 🟠 Alto |
| QC-06 | **Código duplicado/orfandad:** `backend/src_old/main.py` conserva el sanitizer + límite de 10 MB + CORS restringido que **ya no se aplican** en v2.0. Riesgo de editar el archivo equivocado. | `backend/src_old/` | 🟡 Media |
| QC-07 | **Sin logging estructurado:** todo es `print()`; errores externos de Groq se imprimen enteros sin contexto ni nivel. | `services/*.py` | 🟡 Media |
| QC-08 | **Contratos inconsistentes:** `/api/voice` no valida `content_type` ni archivo vacío (a diferencia de `/api/transcribe`), no tiene manejo de error propio y puede devolver `audio_base64` vacío con HTTP 200 si el TTS falla; las respuestas del LLM no se sanitizan antes de devolver/sintetizar. | `routers/voice.py:98-142` | 🟡 Media |

### 2.2 Frontend (Next.js)

| ID | Hallazgo | Archivo | Severidad |
|---|---|---|---|
| QC-09 | **APIs experimentales de Chrome:** `navigator.mediaDevices.getUserMedia`, `new MediaRecorder(stream,…)`, `audioContext.createAnalyser()`, `createMediaStreamSource()`, `new Audio(src)` — ninguna es estándar multiplataforma; solo funciona en Chrome reciente, sin fallback para Firefox/Safari. | `hooks/useSofiaVoice.js:129-142,257` | 🟠 Alto (portabilidad) |
| QC-10 | **Sin automatización de calidad:** no hay tests unitarios/E2E, ni lint/typecheck dedicado, ni CI. El build pasa por el mini-lint embebido de Next. | `package.json` | 🟡 Media |
| QC-11 | **Rótulos desactualizados:** el footer dice `gTTS:active` cuando v2.0 usa **EdgeTTS**; cadenas mezclan ES/PT ("PUSH TO TALK" vs "Desativar microfone"). | `app/sofia-voice/page.jsx:143` | 🟢 Baja |
| QC-12 | **Estilo inline masivo:** el orquestador y componentes cargan decenas de objetos `style={{…}}`; el CSS global solo tiene keyframes. Mantenibilidad media-baja. | `page.jsx`, `TerminalLog.jsx`, etc. | 🟢 Baja |
| QC-13 | **Dependencias mínimas y sanas:** solo `next/react/react-dom`; sin paquetes de terceros en runtime (punto a favor). | `package.json` | ✅ Positivo |

---

## 3. Seguridad y Blindaje

### 3.1 `sanitize_text()` — ✅ Operativo (parcial)
`routers/voice.py:16-24` elimina tags `<...>` y caracteres de control y limita a 2000 caracteres. **Prueba real:** el payload con `<script>alert(1)</script><img src=x onerror=alert(2)>` llegó al log sin ninguna etiqueta.

**Limitaciones:**
- Solo cubre **entrada**. La **salida del LLM no se sanitiza** antes de devolverla o sintetizarla → un modelo engañado podría emitir HTML/instrucciones no deseadas (riesgo bajo, pero existe).
- No hay sanitización sobre los **logs persistidos** más allá de la entrada ya limpia (en `/api/voice` pasa la respuesta cruda del modelo).

### 3.2 CORS — 🔴 NO restringido
`backend/main.py:12-17` usa `allow_origins=["*"]` con `allow_methods=["*"]`. **Preflight real:**
```
OPTIONS /api/chat · Origin: http://evil.com
HTTP/1.1 200 OK
access-control-allow-origin: *
access-control-allow-methods: DELETE, GET, HEAD, OPTIONS, PATCH, POST, PUT
```
La versión "restringida" vive únicamente en `src_old/main.py` ("14.2 — CORS Restrito al Frontend", `localhost:3000`). **La traba de CORS NO está operativa en v2.0:** cualquier sitio puede llamar la API desde el navegador de una víctima y quemar créditos Groq.

### 3.3 Traba de payload de 10 MB — 🔴 NO operativa
El middleware `limit_payload_size` (HTTP 413 para >10 MB) existe **solo en `backend/src_old/main.py`**; **no está en `backend/main.py` ni en los routers v2.0**.
**Prueba real:** upload de 11 MB a `/api/transcribe` → **sin 413** (terminó en 500 por el bug QC-04). Un atacante puede subir archivos enormes y agotar la memoria del worker (DoS). Aplica también a `/api/chat` y `/api/speak` (el JSON se lee completo en memoria antes de truncarse a 2000 caracteres con `sanitize_text`).

### 3.4 Otros hallazgos de seguridad

| ID | Hallazgo | Detalle | Severidad |
|---|---|---|---|
| S-01 | **Sin autenticación ni rate limit** en ningún endpoint → abuso directo del API key de Groq (costo) y spam. | — | 🔴 Crítico (con dominio público) |
| S-02 | **Fuga de contexto entre usuarios** por `LLMService.history` global (QC-05) → privacidad. | `services/llm.py:15` | 🟠 Alto |
| S-03 | **Sin timeout en el cliente Groq** → una llamada colgada deja la conexión abierta indefinidamente (DoS simple y mala UX). | `services/llm.py:38` / `stt.py:16` | 🟠 Alto |
| S-04 | **Errores externos impresos sin filtrar** (traza Groq completa en stdout con `print`) y 500 planos al cliente (reproducido con 11 MB). | `stt.py` / `voice.py` | 🟡 Media |
| S-05 | `.env` correctamente ignorado; **no se hallaron credenciales commiteadas**. | `.gitignore` | ✅ Positivo |
| S-06 | Archivos basura en la raíz sin trackear (`teste.txt`) y `logs/` duplicado en raíz vs `backend/logs/` → ruido y posible exposición de conversaciones en el repo. | raíz | 🟢 Baja |

---

## 4. Performance y Latencia — v1.0 (gTTS) vs v2.0 (EdgeTTS + Groq)

### 4.1 Medición empírica local (2026-09-09)

| Etapa | v1.0 (baseline) | v2.0 medido | Fuente |
|---|---|---|---|
| STT (Whisper large-v3 vía Groq) | ~0.4–0.7 s (documentado) | **0.835 s** | log server `[LATÊNCIA - STT]` |
| LLM (Groq) | — (solo 1 round-trip) | **0.42–1.08 s** (3 muestras: 0.416 / 0.703 / 1.078) | log server `[LATÊNCIA - LLM]` |
| TTS síntesis (gTTS vs EdgeTTS, mismo texto) | **0.70–1.01 s** (prom. ~0.85 s) | **1.62–2.51 s** (prom. ~2.0 s) | benchmark local + `/api/speak` |
| Tamaño del MP3 generado | 64.5 KB (gTTS) | **30.8 KB (EdgeTTS)** → **−52 %** | benchmark local |
| Pipeline completo `/api/voice` | — | **2.94 s** (audio falso de 1 s) | curl |
| Pipeline 3 POST (frontend) | — | **≈ 3.8–4.4 s** (0.84 + 0.4–1.1 + 2.5) | suma de mediciones |

**Lectura honesta del benchmark TTS:**
- En esta red, **EdgeTTS fue MÁS lento que gTTS** en síntesis bruta (~2.0 s vs ~0.85 s de media).
- Sin embargo, el audio de EdgeTTS pesa **la mitad** (30.8 KB vs 64.5 KB): la transferencia al navegador y el decode son más rápidos, y la voz neural (`pt-BR-FranciscaNeural`) es más natural.
- La caída real de latencia de v2.0 viene de **Groq** (Whisper + LLM en una sola pasada de red, TTFB del LLM ~0.4 s) y de eliminar el desvío por ElevenLabs de versiones intermedias. El objetivo v3.0 (≤300 ms TTFB con streaming) sigue pendiente y correctamente planificado en `docs/STREAMING_V3_PLAN.md`.

### 4.2 Gargalo medido: event loop bloqueado 🧨
Prueba con **5 `/api/chat` concurrentes**:

| Métrica | Resultado |
|---|---|
| Duración individual | 1.00 / 1.52 / 2.63 / 3.25 / 3.69 s |
| **Wall total** | **3.69 s** (≈ serialización: cada petición espera a la anterior) |
| Con un worker y endpoints `async def` con `llm.chat()` síncrono | El servidor NO puede atender 2 peticiones a la vez |

**Conclusión:** bajo carga real (2+ usuarios), la latencia se degrada linealmente. Hay que mover los llamados a Groq/EdgeTTS a `run_in_executor`/`AsyncGroq` o usar `def` (FastAPI los ejecuta en threadpool) — por ejemplo el `while` de las TTS ya es `await`, pero `transcribe` y `chat` no lo son.

---

## 5. Ejecución de Pruebas

> No existen scripts de carga/seguridad (PowerShell/Python) ni suite `pytest` en el repo. Se ejecutaron pruebas reales contra el servidor levantado localmente (`uvicorn main:app --port 8010`).

### 5.1 Batería HTTP en vivo

| # | Prueba | Resultado | Código | Tiempo |
|---|---|---|---|---|
| 1 | `GET /health` | `{"status":"ok","version":"2.0.0"}` | 200 | instantáneo |
| 2 | `OPTIONS /api/chat` · Origin `http://evil.com` | **CORS abierto (`allow-origin: *`)** | 200 | — |
| 3 | `POST /api/chat` mensaje normal | Respuesta correcta en PT | 200 | 0.72 s (LLM 0.703 s) |
| 4 | `POST /api/chat` inyección `<script>`/`<img onerror>` | Tags **eliminados** (verificado en log) + LLM rechazó pedido | 200 | 0.44 s |
| 5 | `POST /api/chat` mensaje vacío | `"Mensagem não pode ser vazia…"` | **400** | — |
| 6 | `POST /api/chat` 5000 caracteres | Aceptado (truncado a 2000 por `sanitize_text`) | 200 | 1.08 s |
| 7 | `POST /api/speak` texto válido | MP3 base64 (41 088 chars) · `latency_seconds: 2.513` | 200 | 2.52 s |
| 8 | `POST /api/speak` texto vacío | `"Texto não pode ser vazio…"` | **400** | — |
| 9 | `POST /api/transcribe` content-type `octet-stream` | `"Envie um arquivo de áudio."` | **400** | — |
| 10 | `POST /api/transcribe` WAV de silencio (1 s) | **Whisper alucinó** `"Apenas o que você quer."` (falta VAD/validación) | 200 | 0.84 s |
| 11 | `POST /api/transcribe` **11 MB** | **Sin 413** → `UnicodeEncodeError` en el `except` → **500** | 500 | 12.7 s |
| 12 | `POST /api/voice` pipeline completo (WAV falso) | JSON con `user_text` + `ai_response` + `audio_base64` | 200 | 2.94 s |
| 13 | 5 × `POST /api/chat` concurrentes | **Serialización del event loop** (wall 3.69 s) | 200 | ver §4.2 |
| 14 | `python -m py_compile` (todo el backend) | **OK** | — | — |
| 15 | `npm run build` (Next.js producción) | **Compila + lint OK** · First Load JS 108 kB | — | — |
| 16 | Benchmark TTS local ×2 (gTTS / EdgeTTS) | 0.70–1.01 s / 1.62–1.96 s; 64.5 KB / 30.8 KB | — | — |

### 5.2 Evidencia de logs del servidor (extracto)
```
[LATÊNCIA - LLM (Groq)]:    0.703s
[LATÊNCIA - LLM (Groq)]:    0.416s
[LATÊNCIA - LLM (Groq)]:    1.078s
[LATÊNCIA - TTS (EdgeTTS)]: 2.513s
[LATÊNCIA - STT (Whisper)]: 0.835s
POST /api/transcribe HTTP/1.1" 500 Internal Server Error   ← UnicodeEncodeError (CP1252)
```

---

## 6. Matriz Consolidada de Hallazgos por Severidad

| Severidad | IDs | Conteo |
|---|---|---|
| 🔴 **Crítico (bloquea release)** | QC-01 (edge-tts no está en `requirements.txt`) · QC-03 (event loop bloqueado) · S-01 (sin auth/rate limit) · CORS `*` (S-00) · Payload 10 MB ausente (S-00) | 5 |
| 🟠 **Alto** | QC-04 (except rompe en Windows) · QC-05 (historia global) · QC-09 (APIs Chrome experimentales) · S-02 · S-03 | 5 |
| 🟡 **Medio** | QC-02 · QC-06 · QC-07 · QC-08 · QC-10 · S-04 | 6 |
| 🟢 **Bajo** | QC-11 · QC-12 · S-06 · docs desactualizados (README/ARCHITECTURE) · sin `.env.exemple` en `backend/` | 5 |
| ✅ **Positivos** | QC-13 (deps mínimas) · S-05 (sin secretos en git) · sanitize_text operativo · build Next OK · validación 400 en chat/speak | 5 |

---

## 7. Veredicto Final — FASE 18 (Publicación / Tags Git v2.0.0)

### ✅ Prós (lo que está bien para publicar)
1. **El flujo feliz funciona de punta a punta** y el HUD de métricas (STT/LLM/TTS/TOTAL) es real, medido y visible en el frontend.
2. **Sanitización de entrada operativa y verificada** (tags HTML eliminados en prueba real).
3. **Sin credenciales commiteadas**; `.env` ignorado; dependencias de runtime del frontend mínimas (solo Next/React).
4. **Build de producción de Next.js sin errores** (compile + lint + rutas estáticas OK).
5. **Código del backend compacto y legible** en su capa de servicios; la separación `routers/services` es correcta.
6. **Plan v3.0 bien documentado** (`STREAMING_V3_PLAN.md`): el siguiente paso arquitectural está claro y coherente con los hallazgos de este audit (sesiones, async, buffer).

### ❌ Contras (lo que NO permite declarar v2.0.0 hoy)
1. **`requirements.txt` está roto para deploy limpio** (falta `edge-tts`; sobra `gTTS`) → en Render/CI el arranque falla.
2. **CORS abierto a `*`** con **API sin autenticación ni rate limit** → cualquiera puede quemar el presupuesto de Groq y leer/alterar el contexto global del bot.
3. **La traba de 10 MB no existe en el código v2.0** (quedó en `src_old/`) → vector de DoS por memoria (verificado: 11 MB no dan 413).
4. **Concurrencia nula**: un solo request bloquea al servidor (medido) → mal comportamiento con 2+ usuarios.
5. **Bug de encoding en los `except`** rompe el manejo de errores en Windows (`500` en vez de fallback) — el entorno de desarrollo del autor está afectado.
6. **Estado del histórico LLM es global** → fuga de privacidad entre usuarios.
7. **Cero automatización de pruebas** (sin pytest, sin scripts de carga/seguridad, sin CI): la "garantía de calidad" es manual.
8. **Docs desactualizados** (README/ARCHITECTURE dicen gTTS/LLaMA 3.3 70B/Railway; el footer del frontend dice `gTTS:active`) → contradicen el código v2.0.
9. **Frontend atado a Chrome** por APIs experimentales → no es multiplataforma de facto.

### 🎯 Veredicto
> ## 🔴 **NO-GO condicionado para el tag `v2.0.0`**
> El estado actual de `main` + cambios sin commitear **no debe** marcarse como v2.0.0 publicado en un entorno público. Con la corrección de los **5 críticos** (o al menos los 3 estructurales: `requirements.txt`, CORS/payload en `main.py`, async en routers) y un pase de pruebas automatizado, la FASE 18 está a **pocas horas de trabajo**. Mientras tanto, se recomienda **mantener v2.0 como etiqueta interna `v2.0.0-rc.1`** en git local.

---

## 8. Plan de Acción Recomendado (priorizado)

| # | Acción | Esfuerzo | Impacto |
|---|---|---|---|
| 1 | Añadir `edge-tts` y versionar dependencias (`requirements.txt` con pins o `uv.lock`); quitar `gTTS`. | Bajo | Elimina el bloqueante de deploy |
| 2 | Restaurar en `backend/main.py` el **middleware de payload (10 MB → 413)** y restringir **CORS** a los orígenes reales (Vercel + localhost + dominio propio). | Bajo | Cierra 2 vectores críticos |
| 3 | Hacer async de verdad: `AsyncGroq` (`groq.AsyncGroq`) o `run_in_executor`, y `await` en los routers. | Medio | Concurrencia real |
| 4 | Reemplazar `print("❌…")` por `logging` con `errors="replace"`/UTF-8 seguro; centralizar manejos de excepción que devuelvan JSON limpio. | Bajo | Robustez multiplataforma |
| 5 | Mover `self.history` a un `session_id` por usuario (o fastidiar el diseño para v3.0) y añadir **rate limiting** básico (slowapi/limits) + auth mínimo por API key. | Medio | Privacidad y economía |
| 6 | Eliminar `src_old/` o marcarlo como carpeta congelada; borrar `teste.txt`; unificar `logs/` (raíz vs backend). | Bajo | Higiene de repo |
| 7 | Añadir suite mínima: `pytest` para `sanitize_text` + endpoints (TestClient), y un script de carga (locust/k6) reutilizando los casos de este audit. | Medio | QA reproducible |
| 8 | Actualizar README/ARCHITECTURE/footer a EdgeTTS + gpt-oss-20b + Render; dejar `.env.exemple` dentro de `backend/`. | Bajo | Coherencia de marca |
| 9 | Commitear/limpiar el árbol: hay **13 archivos modificados + 4 untracked** sin commit; se pierde trazabilidad para el release. | Bajo | Gobernanza |

---

## 9. Anexos

- **Artefactos de auditoría:** todos los archivos temporales de prueba (payloads, binarios de 11 MB, logs del server, script de concurrencia, `.next/`) fueron **eliminados** tras la ejecución; el árbol git quedó exactamente como estaba.
- **Nota metodológica:** los tiempos de TTS dependen de red y proveedor; el benchmark local usó el mismo texto y máquina para gTTS y EdgeTTS.
- **Documento vivo:** este informe debe re-ejecutarse (`AUDIT_REPORT_V2.md`) al cerrar los críticos y antes del tag definitivo.

---
*Auditoria realizada el 2026-09-09 · SofiaVoice v2.0 · Rs4Machine — Fin del informe.*