from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    instagram_app_id: str = ""
    instagram_app_secret: str = ""
    oauth_redirect_uri: str = "http://localhost:8000/auth/callback"
    session_secret: str = "change-me"
    anthropic_api_key: str = ""
    database_url: str = "sqlite:///./instagram_analyzer.db"

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()
