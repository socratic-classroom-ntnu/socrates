FROM python:3.12-slim
WORKDIR /app
COPY backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/ ./
COPY ladders/ /data/ladders/
COPY scripts/ /data/scripts/
ARG SOURCE_SHA=local
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1 \
    SOCRATES_SOURCE_SHA=${SOURCE_SHA} \
    LADDER_PATH=/data/ladders/trolley.yaml SCRIPT_PATH=/data/scripts/trolley.script.yaml
EXPOSE 8000
CMD ["sh","-c","alembic upgrade head && exec uvicorn app.classroom_server:app --host 0.0.0.0 --port 8000 --workers ${WEB_CONCURRENCY:-2}"]
