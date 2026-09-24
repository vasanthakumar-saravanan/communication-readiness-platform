from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    app_name: str = "ai-service"
    app_version: str = "0.1.0"
    debug: bool = False
    llm_provider: str = "groq"
    groq_api_key: str = ""
    groq_model: str = "llama-3.3-70b-versatile"
    # Generic LLM config (takes priority over groq_* vars)
    llm_api_key: str = ""
    llm_base_url: str = ""
    llm_model: str = ""
    # Shared secret required by POST /ai/config — set to a strong random string in production
    internal_api_key: str = "change-me"

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()
