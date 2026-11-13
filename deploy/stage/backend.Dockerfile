FROM python:3.12-slim
WORKDIR /app
# 雷達的本地 embedding 模型（ai_providers.embeddings）：固定 revision，sha256 不符就建置失敗。
# 放在最前面，改套件或程式都不會重新下載這 490 MB。
ADD --chmod=644 --checksum=sha256:ca456c06b3a9505ddfd9131408916dd79290368331e7d76bb621f1cba6bc8665 \
    https://huggingface.co/intfloat/multilingual-e5-small/resolve/614241f622f53c4eeff9890bdc4f31cfecc418b3/onnx/model.onnx /opt/models/multilingual-e5-small/model.onnx
ADD --chmod=644 --checksum=sha256:0b44a9d7b51c3c62626640cda0e2c2f70fdacdc25bbbd68038369d14ebdf4c39 \
    https://huggingface.co/intfloat/multilingual-e5-small/resolve/614241f622f53c4eeff9890bdc4f31cfecc418b3/onnx/tokenizer.json /opt/models/multilingual-e5-small/tokenizer.json
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
