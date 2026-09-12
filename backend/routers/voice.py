import time
import re
from fastapi import APIRouter, UploadFile, File, HTTPException
from pydantic import BaseModel
from services.stt import STTService
from services.llm import LLMService
from services.tts import TTSService

router = APIRouter()

stt = STTService()
llm = LLMService()
tts = TTSService()

# 14.1 — Função de Sanitização Avançada de Texto
def sanitize_text(input_string: str, max_chars: int = 2000) -> str:
    if not input_string:
        return ""
    # Remove tags HTML/Script para prevenir injeção
    clean = re.sub(r'<[^>]*>', '', input_string)
    # Remove caracteres nulos/estranhos de controle
    clean = re.sub(r'[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]', '', clean)
    # Aparar espaços em branco nas pontas e limitar tamanho maximo
    return clean.strip()[:max_chars]

class ChatRequest(BaseModel):
    message: str

class SpeakRequest(BaseModel):
    text: str

@router.post("/transcribe")
async def transcribe(file: UploadFile = File(...)):
    """[v2.0] Audio → texto (Wait-Then-Play)."""
    # TODO (v3.0): Este endpoint queda como LEGACY aislado. El flujo de
    # streaming reemplazará este POST por chunks de audio enviados por
    # /ws/audio, donde cada bin parcial se transcribirá incrementalmente
    # (Whisper Streaming) sin esperar el archivo completo.
    t0 = time.perf_counter()
    if not file.content_type.startswith("audio/"):
        raise HTTPException(status_code=400, detail="Envie um arquivo de áudio.")

    audio_bytes = await file.read()
    if not audio_bytes:
        raise HTTPException(status_code=400, detail="Arquivo de áudio vazio.")

    text = stt.transcribe(audio_bytes, filename=file.filename or "audio.wav")
    t_stt = time.perf_counter() - t0

    # v2.0: áudios em branco, ruídos sem fala ou webm curtos retornam texto
    # vazio do STT — não é um erro de requisição. Em vez do HTTP 422, registra
    # um log amigável de latência e devolve HTTP 200 OK com {"text": ""} para
    # o frontend (Next.js/Vercel) tratar como "nenhuma fala detectada".
    if not text:
        print(f"[LATÊNCIA - STT (Whisper)]: {t_stt:.3f}s (Sem fala detectada)")
        return {"text": ""}

    # Sanitiza o texto transcrito pelo Whisper antes de devolver
    text_clean = sanitize_text(text)

    print(f"[LATÊNCIA - STT (Whisper)]: {t_stt:.3f}s")
    return {"text": text_clean}

@router.post("/chat")
async def chat(body: ChatRequest):
    """[v2.0] Texto → respuesta IA (síncrono)."""
    # TODO (v3.0): Este endpoint queda como LEGACY aislado. En el flujo
    # streaming, la respuesta del LLM se emitirá por SSE/WebSocket token a
    # token (Groq LLaMA stream=true) para render infraframes en el frontend.
    t0 = time.perf_counter()
    clean_message = sanitize_text(body.message)

    if not clean_message:
        raise HTTPException(status_code=400, detail="Mensagem não pode ser vazia ou conter apenas caracteres inválidos.")

    response = await llm.chat(clean_message)
    t_llm = time.perf_counter() - t0

    print(f"[LATÊNCIA - LLM (Groq)]:    {t_llm:.3f}s")
    return {"response": response}

@router.post("/speak")
async def speak(body: SpeakRequest):
    """[v2.0] Texto → audio base64 (síncrono)."""
    # TODO (v3.0): Este endpoint queda como LEGACY aislado. En el flujo
    # streaming, la síntesis TTS se troceará en chunks de audio MP3 y se
    # enviará incrementalmente por el socket (EdgeTTS ya genera por-stream).
    t0 = time.perf_counter()
    clean_text = sanitize_text(body.text)

    if not clean_text:
        raise HTTPException(status_code=400, detail="Texto não pode ser vazio ou conter apenas caracteres inválidos.")

    audio_b64 = await tts.synthesize(clean_text)
    t_tts = time.perf_counter() - t0

    if not audio_b64:
        raise HTTPException(status_code=500, detail="Erro ao sintetizar voz.")

    print(f"[LATÊNCIA - TTS (EdgeTTS)]: {t_tts:.3f}s\n")
    return {"audio_base64": audio_b64, "format": "mp3", "latency_seconds": round(t_tts, 3)}

@router.post("/voice")
async def voice_pipeline(file: UploadFile = File(...)):
    """[v2.0] Pipeline completo en una llamada (Wait-Then-Play)."""
    # TODO (v3.0): Este endpoint será SUSTITUIDO por el WebSocket /ws/audio.
    # El flujo en v3.0 será: chunks de audio → transcribir parcial (Whisper
    # streaming) → token stream (SSE) → chunks de audio TTS. Este handler
    # quedará marcado como deprecated/doc, pero operativo para compatibilidad
    # con clientes antiguos (el frontend Next.js decidirá WS vs REST).
    t0 = time.perf_counter()
    audio_bytes = await file.read()

    # 1. Transcreve
    t_stt_0 = time.perf_counter()
    user_text = stt.transcribe(audio_bytes, filename=file.filename or "audio.wav")
    t_stt = time.perf_counter() - t_stt_0

    if not user_text:
        raise HTTPException(status_code=422, detail="Não entendi o áudio.")

    user_text_clean = sanitize_text(user_text)

    # 2. Resposta da IA
    t_llm_0 = time.perf_counter()
    ai_response = await llm.chat(user_text_clean)
    t_llm = time.perf_counter() - t_llm_0

    # 3. Voz
    t_tts_0 = time.perf_counter()
    audio_b64 = await tts.synthesize(ai_response)
    t_tts = time.perf_counter() - t_tts_0

    t_total = time.perf_counter() - t0

    print("--- [MÉTRICAS DE LATÊNCIA (PIPELINE)] ---")
    print(f"STT:   {t_stt:.3f}s")
    print(f"LLM:   {t_llm:.3f}s")
    print(f"TTS:   {t_tts:.3f}s")
    print(f"TOTAL: {t_total:.3f}s\n")

    return {
        "user_text": user_text_clean,
        "ai_response": ai_response,
        "audio_base64": audio_b64,
        "format": "mp3",
    }