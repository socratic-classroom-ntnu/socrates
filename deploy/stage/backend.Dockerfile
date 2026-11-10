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
    LADDER_PATH=/data/ladders/trolley.yaml
EXPOSE 8000
# 測試帳號：只在 preview／stage／dev 這類環境建立（app/modules/platform/demo.py），正式環境會拒絕。
# 建不成（拒絕或出錯）都不擋啟動，原因留在 log。
CMD ["sh","-c","alembic upgrade head && { python /data/scripts/seed_preview.py || true; } && exec uvicorn app.classroom_server:app --host 0.0.0.0 --port 8000 --workers ${WEB_CONCURRENCY:-2}"]
