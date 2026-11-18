"""Local embeddings: pooling and batching with a stand-in model, and the real model when present."""

import os
from pathlib import Path
from types import SimpleNamespace

import numpy as np
import pytest

from app.modules.ai_providers import embeddings
from app.modules.ai_providers.contracts import EMBEDDING_DIMENSIONS, EmbeddingUnavailable
from app.modules.ai_providers.service import embed


@pytest.fixture(autouse=True)
def fresh_model(monkeypatch):
    monkeypatch.setattr(embeddings, "_loaded", None)


class Tokenizer:
    """One token per character, padded to the longest text in the batch, like the real one."""

    def __init__(self):
        self.seen = []

    def encode_batch(self, texts):
        self.seen.append(texts)
        width = max(map(len, texts))
        return [
            SimpleNamespace(ids=[1] * width, attention_mask=[1] * len(t) + [0] * (width - len(t)))
            for t in texts
        ]


class Session:
    """Real tokens carry their text's length on the first axis; padding carries garbage."""

    def run(self, outputs, inputs):
        mask = inputs["attention_mask"]
        hidden = np.full((*mask.shape, EMBEDDING_DIMENSIONS), 1e6)
        hidden[mask == 1] = 0.0
        hidden[..., 0] = np.where(mask == 1, mask.sum(axis=1, keepdims=True), 1e6)
        hidden[..., 1] = np.where(mask == 1, 1.0, 1e6)
        return [hidden]


def test_vectors_pool_only_real_tokens_and_keep_the_input_order(monkeypatch):
    tokenizer = Tokenizer()
    monkeypatch.setattr(embeddings, "_loaded", (tokenizer, Session()))
    monkeypatch.setattr(embeddings, "BATCH", 2)
    vectors = embed(["a", "abc", "ab"])
    assert tokenizer.seen == [["query: a", "query: abc"], ["query: ab"]]
    for vector, length in zip(vectors, (8, 10, 9)):
        assert len(vector) == EMBEDDING_DIMENSIONS
        assert vector[:2] == pytest.approx(list(np.array([length, 1]) / np.hypot(length, 1)))
    assert embed([]) == []


def test_missing_model_files_raise_embedding_unavailable(monkeypatch, tmp_path):
    monkeypatch.setenv("EMBEDDING_MODEL_DIR", str(tmp_path))
    with pytest.raises(EmbeddingUnavailable):
        embed(["我覺得五個人比較多"])


real = Path(os.environ.get("EMBEDDING_MODEL_DIR", embeddings.MODEL_DIR))


@pytest.mark.skipif(not (real / "model.onnx").is_file(), reason="model files not present")
def test_the_real_model_groups_meaning_across_languages():
    texts = ["救五個人比較好，因為人數比較多", "Saving five people is better", "今天的午餐很好吃"]
    batched = np.array(embed(texts))
    assert batched.shape == (3, EMBEDDING_DIMENSIONS)
    assert np.linalg.norm(batched, axis=1) == pytest.approx([1, 1, 1])
    # Padding in a batch must not move a vector.
    assert batched[2] == pytest.approx(np.array(embed(texts[2:])[0]), abs=1e-5)
    similar, unrelated = batched[0] @ batched[1], batched[0] @ batched[2]
    assert similar > unrelated
