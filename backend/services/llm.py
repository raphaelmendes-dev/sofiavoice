import logging
import os
import re
from datetime import datetime

from groq import AsyncGroq

from config import GROQ_API_KEY

LOG_DIR = "logs"
os.makedirs(LOG_DIR, exist_ok=True)

logger = logging.getLogger(__name__)

MAX_INPUT_CHARS = 2000
MAX_HISTORY_TURNS = 10


def sanitize_text(text: str) -> str:
    """
    Remove tags HTML/scripts via regex e limita o input do usuário
    a no máximo 2000 caracteres.
    """
    if not text:
        return ""
    # Remove blocos <script>...</script> (com/sem atributos) e demais tags
    clean = re.sub(r"<script[\s\S]*?</script>", "", text, flags=re.IGNORECASE)
    clean = re.sub(r"<[^>]*>", "", clean)
    # Remove caracteres de controle nulos/estranhos
    clean = re.sub(r"[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]", "", clean)
    return clean.strip()[:MAX_INPUT_CHARS]


class LLMService:
    def __init__(self):
        self.client = AsyncGroq(api_key=GROQ_API_KEY)
        self.model = "llama-3.3-70b-versatile"
        self.system_prompt = (
            "Você é a Sofia, assistente virtual inteligente da Rs4Machine. "
            "Responda de forma clara, objetiva e sempre em português. "
            "Máximo 2 frases por resposta. Seja direta e útil."
        )

    async def chat(self, user_message: str, history: list | None = None) -> str:
        """
        [v2.0] Recebe a mensagem do usuário e retorna a resposta da Sofia.

        Sem estado global: o histórico é opcional e pertence à sessão do
        chamador (por chamada). Não há vazamento de contexto entre usuários.
        """
        clean_message = sanitize_text(user_message)

        # Monta as mensagens da sessão (system + histórico + mensagem atual)
        messages = [{"role": "system", "content": self.system_prompt}]

        if history:
            for entry in history[-MAX_HISTORY_TURNS:]:
                if (
                    not isinstance(entry, dict)
                    or entry.get("role") not in ("user", "assistant")
                    or entry.get("content") is None
                ):
                    continue
                role = entry["role"]
                content = str(entry["content"])
                if role == "user":
                    content = sanitize_text(content)
                messages.append({"role": role, "content": content})

        messages.append({"role": "user", "content": clean_message})

        try:
            response = await self.client.chat.completions.create(
                model=self.model,
                messages=messages,
                max_tokens=250,
            )

            bot_response = response.choices[0].message.content
            self._save_log(clean_message, bot_response)
            return bot_response

        except Exception as e:
            logger.error("Erro ao chamar o LLM (Groq): %s", e, exc_info=True)
            return "Desculpe, ocorreu um erro ao processar sua mensagem."

    def _save_log(self, user_msg: str, bot_msg: str):
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        filename = f"conversa_{datetime.now().strftime('%Y-%m-%d')}.txt"
        entry = (
            f"============================================================\n"
            f"[{timestamp}]\n"
            f"👤 USUÁRIO: {user_msg}\n"
            f"🤖 SOFIA: {bot_msg}\n"
        )
        with open(os.path.join(LOG_DIR, filename), "a", encoding="utf-8") as f:
            f.write(entry)