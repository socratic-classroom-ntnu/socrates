from app.api.history_schemas import SessionHistoryPage
from app.api.schemas import SummaryView


def test_round1_summary_contract() -> None:
    summary = SummaryView(
        core_principle="降低可避免的傷害",
        key_points=["人數會影響判斷", "介入方式也重要"],
        tension="結果與責任之間的張力",
        stage_outcomes=[],
    )
    assert summary.discussion_topic.startswith("電車難題")
    assert len(summary.key_points) == 2


def test_history_page_contract() -> None:
    page = SessionHistoryPage(items=[], next_cursor=None)
    assert page.next_cursor is None
