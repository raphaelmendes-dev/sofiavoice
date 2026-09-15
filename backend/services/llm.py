import re
import logging
from groq import AsyncGroq
from config import GROQ_API_KEY

logger = logging.getLogger(__name__)

MAX_INPUT_CHARS = 2000
MAX_HISTORY_TURNS = 10

def sanitize_text(text: str) -> str:
    """Remove tags HTML e limita o input do usuário."""
    if not text:
        return ""
    clean = re.sub(r"<script[\s\S]*?</script>", "", text, flags=re.IGNORECASE)
    clean = re.sub(r"<[^>]*>", "", clean)
    clean = re.sub(r"[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]", "", clean)
    return clean.strip()[:MAX_INPUT_CHARS]

class LLMService:
    def __init__(self):
        # 1. Usa o cliente AsyncGroq correto
        self.client = AsyncGroq(api_key=GROQ_API_KEY)
        # 2. Usa o modelo oficial ativo na Groq
        self.model = "openai/gpt-oss-20b"
        self.system_prompt = (
            "Você é a Sofia, assistente virtual inteligente da Rs4Machine. "
            "Responda de forma clara, objetiva e sempre em português. "
            "Máximo 2 frases por resposta. Seja direta e útil."
        )

    async def chat(self, user_message: str, history: list | None = None) -> str:
        clean_message = sanitize_text(user_message)
        messages = [{"role": "system", "content": self.system_prompt}]

        if history:
            for entry in history[-MAX_HISTORY_TURNS:]:
                if (
                    isinstance(entry, dict)
                    and entry.get("role") in ("user", "assistant")
                    and entry.get("content")
                ):
                    messages.append({
                        "role": entry["role"],
                        "content": sanitize_text(str(entry["content"])) if entry["role"] == "user" else str(entry["content"])
                    })

        messages.append({"role": "user", "content": clean_message})

        try:
            response = await self.client.chat.completions.create(
                model=self.model,
                messages=messages,
                max_tokens=250,
            )
            return response.choices[0].message.content
        except Exception as e:
            logger.error(f"Erro ao chamar LLM via AsyncGroq: {e}", exc_info=True)
            return "Desculpe, ocorreu um erro ao processar sua mensagem."