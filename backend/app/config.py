"""
Application configuration, loaded from environment variables (or .env file).
"""
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str = "sqlite:///./focusflow.db"
    secret_key: str = "dev-secret-key-change-me"
    access_token_expire_minutes: int = 720  # 12 hours
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"
    cooldown_seconds: int = 60  # required wait before disabling protection / editing allow list mid-session

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    @property
    def cors_origins_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


settings = Settings()
