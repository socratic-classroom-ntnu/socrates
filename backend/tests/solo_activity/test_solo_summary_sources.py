"""Ken 5 統整引用: every quote a kept final summary cites is stored in solo_summary_sources, one row
each, and each quote is a substring of that student's own message at the stored offsets."""

from sqlalchemy import func, select

from app.modules.platform import storage as storage
from app.modules.solo_activity import service
from app.modules.solo_activity.repositories import SoloMessage, SoloSummarySource
from tests.solo_activity.test_solo_attempts_api import do, ok
from tests.solo_activity.test_solo_final_confirmation import FINAL, SECOND, settled, to_reflecting

INVENTED = {
    **FINAL,
    "points": [
        {
            "text": "你認為主動害人和任其發生不一樣。",
            "sources": [
                {"message_ref": "m1", "quote": "不能主動害人"},
                {"message_ref": "m1", "quote": "這句學生沒說過"},
            ],
        }
    ],
}


def utf16(text: str, start: int, end: int) -> str:
    return text.encode("utf-16-le")[2 * start : 2 * end].decode("utf-16-le")


def kept(attempt_id: str, digest: str):
    with storage.transaction() as db:
        rows = service.summary_sources(db, attempt_id, digest)
        out = []
        for row in rows:
            message = db.get(SoloMessage, row.message_id)
            out.append(
                {
                    "part": row.part,
                    "item_index": row.item_index,
                    "quote": row.quote,
                    "role": message.role,
                    "attempt_id": message.attempt_id,
                    "at_offsets": utf16(message.text, row.start, row.end),
                }
            )
        return out


def test_each_quote_of_the_shown_summary_is_stored_and_is_the_students_own_words(client, tutor):
    _, attempt_id, view = to_reflecting(client, tutor)
    rows = kept(attempt_id, view["final_digest"])
    assert [(r["part"], r["item_index"], r["quote"]) for r in rows] == [
        ("point", 0, "不能主動害人"),
        ("step", 0, "親手造成"),
    ]
    for row in rows:
        assert row["role"] == "student" and row["attempt_id"] == attempt_id
        assert row["at_offsets"] == row["quote"]
    # The view and the table name the same messages and offsets.
    shown = view["final_summary"]["points"][0]["sources"][0]
    with storage.transaction() as db:
        first = service.summary_sources(db, attempt_id, view["final_digest"])[0]
        assert (shown["message_id"], shown["start"], shown["end"]) == (
            first.message_id,
            first.start,
            first.end,
        )


def test_a_quote_the_student_never_wrote_is_not_stored(client, tutor):
    _, attempt_id, view = to_reflecting(client, tutor, final=INVENTED)
    assert [r["quote"] for r in kept(attempt_id, view["final_digest"])] == [
        "不能主動害人",
        "親手造成",
    ]


def test_a_summary_written_again_keeps_its_own_rows(client, tutor):
    _, replies = tutor
    _, attempt_id, view = to_reflecting(client, tutor)
    replies.append(SECOND)
    again = settled(
        client,
        attempt_id,
        ok(do(client, attempt_id, "continue_reflection", {"text": "我其實有猶豫"})),
    )
    assert again["final_digest"] != view["final_digest"]
    assert len(kept(attempt_id, view["final_digest"])) == 2
    assert len(kept(attempt_id, again["final_digest"])) == 2
    with storage.transaction() as db:
        total = db.scalar(select(func.count()).select_from(SoloSummarySource))
    assert total == 4


def test_removing_the_student_removes_the_quotes_with_the_attempt(client, tutor):
    from tests.solo_activity.test_solo_enrollment_records import HOOK

    s, attempt_id, view = to_reflecting(client, tutor)
    assert len(kept(attempt_id, view["final_digest"])) == 2
    with storage.transaction() as db:
        HOOK.remove(db, s["course"]["id"], s["student"]["id"])
    with storage.transaction() as db:
        assert db.scalar(select(func.count()).select_from(SoloSummarySource)) == 0
