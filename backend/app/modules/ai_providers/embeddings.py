"""Local text embeddings for the radar: multilingual-e5-small on the CPU, no provider key.

The model is the fp32 ONNX export from intfloat/multilingual-e5-small (MIT). The image ships
model.onnx and tokenizer.json in MODEL_DIR; EMBEDDING_MODEL_DIR points elsewhere (a dev machine).
"""

import os
import threading
from pathlib import Path
from typing import Any

import numpy as np
import onnxruntime  # type: ignore[import-untyped]  # ships no type hints
from tokenizers import Tokenizer

from app.modules.ai_providers.contracts import EmbeddingUnavailable

MODEL_DIR = "/opt/models/multilingual-e5-small"
# The model's context; longer texts are cut, which a student's summary never reaches.
MAX_TOKENS = 512
# Texts per model run, so a large class does not build one huge tensor.
BATCH = 32

_loaded: tuple[Tokenizer, Any] | None = None
_lock = threading.Lock()


def _model() -> tuple[Tokenizer, Any]:
    """The tokenizer and ONNX session, loaded once per process on first use."""
    global _loaded
    with _lock:
        if _loaded is None:
            directory = Path(os.environ.get("EMBEDDING_MODEL_DIR", MODEL_DIR))
            if not all((directory / f).is_file() for f in ("model.onnx", "tokenizer.json")):
                raise EmbeddingUnavailable(
                    f"model.onnx and tokenizer.json not found in {directory}"
                )
            tokenizer = Tokenizer.from_file(str(directory / "tokenizer.json"))
            # The file sets neither; XLM-R pads with <pad> (id 1), not the library's default 0.
            tokenizer.enable_padding(pad_id=1, pad_token="<pad>")
            tokenizer.enable_truncation(MAX_TOKENS)
            options = onnxruntime.SessionOptions()
            # A container's CPU limit is not what the library sees; 0 lets it use every core.
            options.intra_op_num_threads = int(os.environ.get("EMBEDDING_THREADS", "0"))
            session = onnxruntime.InferenceSession(
                str(directory / "model.onnx"), options, providers=["CPUExecutionProvider"]
            )
            _loaded = (tokenizer, session)
        return _loaded


def embed(texts: list[str]) -> list[list[float]]:
    """One vector of EMBEDDING_DIMENSIONS floats per text, in the same order; [] for [].

    Vectors have unit length, so cosine similarity is their dot product. Callers pass the raw
    text; the model's "query: " prefix is added here. This runs the model on the calling thread,
    so async code should call it through run_in_threadpool. Raises EmbeddingUnavailable when the
    model files are missing.
    """
    if not texts:
        return []
    tokenizer, session = _model()
    vectors: list[list[float]] = []
    for start in range(0, len(texts), BATCH):
        encoded = tokenizer.encode_batch(["query: " + t for t in texts[start : start + BATCH]])
        ids = np.array([e.ids for e in encoded], dtype=np.int64)
        mask = np.array([e.attention_mask for e in encoded], dtype=np.int64)
        hidden = session.run(
            None, {"input_ids": ids, "attention_mask": mask, "token_type_ids": np.zeros_like(ids)}
        )[0]
        # Mean over the real tokens only, then unit length: the pooling e5 was trained with.
        mean = (hidden * mask[..., None]).sum(axis=1) / mask.sum(axis=1, keepdims=True)
        vectors += (mean / np.linalg.norm(mean, axis=1, keepdims=True)).tolist()
    return vectors
