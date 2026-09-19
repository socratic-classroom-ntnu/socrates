from fastapi import FastAPI

from app.config import settings
from app.ladders.repository import LadderRepository

ladder_repository = LadderRepository.load(settings.ladder_path)

app = FastAPI(title="Socrates API")


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
