import pytest

from app.ladders.repository import LadderRepository


def test_broken_ladder_raises_on_load():
    """設計規格 §5.3：壞掉的 yaml 必須讓服務啟動失敗，
    不能等到學生跑到第三階才爆。"""
    with pytest.raises(ValueError, match="ladder"):
        LadderRepository.load("tests/fixtures/broken.yaml")
