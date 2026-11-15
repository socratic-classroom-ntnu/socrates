"""The embed() contract other modules build on, before the model is wired in."""

import pytest

from app.modules.ai_providers.contracts import EMBEDDING_DIMENSIONS, EmbeddingUnavailable
from app.modules.ai_providers.service import embed


def test_embed_is_published_with_its_size_and_its_missing_model_error():
    assert EMBEDDING_DIMENSIONS == 384
    with pytest.raises(EmbeddingUnavailable):
        embed(["我覺得五個人比較多"])
