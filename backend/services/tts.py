import io
import base64
import edge_tts

class TTSService:
    def __init__(self, voice: str = "pt-BR-FranciscaNeural"):
        """
        Vozes oficiais em português do Edge-TTS:
          • pt-BR-FranciscaNeural (Feminina - Estável / Padrão)
          • pt-BR-AntonioNeural (Masculino - Estável)
        """
        self.voice = voice

    async def synthesize(self, text: str) -> str:
        """
        Gera o áudio MP3 de forma assíncrona e retorna em Base64.
        """
        if not text or not text.strip():
            return ""

        try:
            communicate = edge_tts.Communicate(text, self.voice)
            audio_stream = io.BytesIO()

            async for chunk in communicate.stream():
                if chunk["type"] == "audio":
                    audio_stream.write(chunk["data"])

            audio_bytes = audio_stream.getvalue()
            if not audio_bytes:
                print(f"[ERRO - TTSService (EdgeTTS)]: Nenhum byte de áudio retornado pela voz {self.voice}.")
                return ""

            return base64.b64encode(audio_bytes).decode("utf-8")

        except Exception as e:
            print(f"[ERRO - TTSService (EdgeTTS)]: {e}")
            return ""