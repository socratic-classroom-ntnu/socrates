from pathlib import Path

from pydantic_settings import BaseSettings


_REPO_ROOT = Path(__file__).resolve().parents[4]


class Settings(BaseSettings):
    database_url: str = "postgresql+psycopg://socrates:socrates@localhost:5432/socrates"
    ladder_path: str = str(_REPO_ROOT / "ladders/trolley.yaml")
    # Voice mode (solo dialogue): every voice setting is read here and nowhere else. The key is a
    # Gemini API key (Google AI Studio); empty means voice mode is not offered.
    voice_gemini_api_key: str = ""
    voice_model: str = "gemini-3.8-live"
    voice_name: str = "Puck"
    # Each student's voice time per day (Asia/Taipei), in seconds.
    voice_daily_seconds: int = 15 * 60


settings = Settings()
