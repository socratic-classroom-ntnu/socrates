FROM python:3.12-slim
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
COPY backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/ /app/
COPY ladders/ /app/ladders/
COPY scripts/ /app/scripts/
ENV LADDER_PATH=/app/ladders/trolley.yaml \
    SCRIPT_PATH=/app/scripts/trolley.script.yaml
EXPOSE 8000
CMD ["sh", "-lc", "alembic upgrade head && exec uvicorn app.main:app --host 0.0.0.0 --port 8000"]
