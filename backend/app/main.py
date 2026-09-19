from fastapi import FastAPI

from app.api.routes import messages, sessions, summaries
from app.config import settings
from app.ladders.repository import LadderRepository

ladder_repository = LadderRepository.load(settings.ladder_path)

app = FastAPI(title="Socrates API")

app.include_router(sessions.router)
app.include_router(messages.router)
app.include_router(summaries.router)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
