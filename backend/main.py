import logging
import sys

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from routers.voice import router as voice_router

# ─────────────────────────────────────────────────────────────
# Logger — UTF-8 compatível com Windows
# ─────────────────────────────────────────────────────────────
if hasattr(sys.stdout, "reconfigure"):
    try:
        # evita crash de encoding (emoji/acentos) no terminal Windows
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
    stream=sys.stdout,  # saída compatível com Windows via reconfigure acima
    force=True,
)

app = FastAPI(
    title="SofiaVoice API",
    description="Rs4Machine · Assistente de Voz · Backend",
    version="2.0.0",
)

# CORS restrito: apenas as origens do frontend local (sem wildcards)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─────────────────────────────────────────────────────────────
# Middleware — Limite de payload (10 MB)
# ─────────────────────────────────────────────────────────────
MAX_PAYLOAD_SIZE = 10 * 1024 * 1024  # 10 MB


class PayloadSizeLimitMiddleware(BaseHTTPMiddleware):
    """Rejeita requisições cujo Content-Length exceda 10 MB."""

    async def dispatch(self, request: Request, call_next):
        content_length = request.headers.get("content-length")
        if content_length and content_length.isdigit():
            if int(content_length) > MAX_PAYLOAD_SIZE:
                return JSONResponse(
                    status_code=413,
                    content={
                        "detail": "Payload muito grande. O limite máximo permitido é 10MB."
                    },
                )
        return await call_next(request)


app.add_middleware(PayloadSizeLimitMiddleware)

app.include_router(voice_router, prefix="/api")

# ─────────────────────────────────────────────────────────────────────
# TODO (v3.0): WebSockets streaming entrypoint
# ─────────────────────────────────────────────────────────────────────
# El pipeline síncrono Wait-Then-Play (HTTP POST) cederá lugar a un
# socket bidireccional para streaming de audio. El endpoint se registrará
# aquí, FUERA del prefijo /api, para no colisionar con las rutas REST:
#
#     from routers.streaming import router as streaming_router
#     app.include_router(streaming_router)      # → /ws/audio, /api/stream
#
# Sincronización v3.0 (ver docs/STREAMING_V3_PLAN.md):
#   1. El primer mensaje abrirá /ws/audio y registrará la conexión en un
#      ConnectionManager (nuevo, separado de los routers REST).
#   2. El cierre se gestionará con on_disconnect para liberar el estado
#      del pipeline (historia del LLM, buffers de audio, contadores).
#   3. /api/transcribe, /api/chat y /api/speak seguirán operativos como
#      fallback legacy mientras el cliente Next.js no detecte soporte WS.


@app.get("/health")
def health():
    return {"status": "ok", "project": "SofiaVoice", "version": "2.0.0"}