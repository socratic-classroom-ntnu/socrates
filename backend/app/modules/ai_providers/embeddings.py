"""Local text embeddings for the radar: multilingual-e5-small on the CPU, no provider key."""

from app.modules.ai_providers.contracts import EmbeddingUnavailable


def embed(texts: list[str]) -> list[list[float]]:
    """One vector of EMBEDDING_DIMENSIONS floats per text, in the same order; [] for [].

    Vectors have unit length, so cosine similarity is their dot product. Callers pass the raw
    text; the model's "query: " prefix is added here. This runs the model on the calling thread,
    so async code should call it through run_in_threadpool. Raises EmbeddingUnavailable when the
    model files are missing.
    """
    raise EmbeddingUnavailable("the local embedding model is not wired in yet")
