from pathlib import Path

from pydantic_settings import BaseSettings


_REPO_ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    database_url: str = "postgresql+psycopg://socrates:socrates@localhost:5432/socrates"
    ladder_path: str = str(_REPO_ROOT / "ladders/trolley.yaml")
    script_path: str = str(_REPO_ROOT / "scripts/trolley.script.yaml")
    provider: str = "scripted"


settings = Settings()
