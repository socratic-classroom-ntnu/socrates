from app.orchestrator.orchestrator import Orchestrator
from tests.orchestrator.conftest import FakeGateway, make_ladder, obs


def test_opening_statement_is_emitted_verbatim():
    """設計規格 §4.2：開場白逐字取自定義檔，不經 LLM。

    經典難題的效力在於敘述的精確——哪些細節給了、哪些刻意沒給都是設計。
    讓模型「用自己的話說一遍」會稀釋掉它，也破壞可重現性。
    """
    ladder = make_ladder()
    orch = Orchestrator(ladder, FakeGateway([obs()]))
    outcome = orch.start()
    assert outcome.appended[0].content == ladder.stage(0).opening_statement
