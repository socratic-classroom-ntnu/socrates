"""Voice mode: judging the student's spoken answer to a summary read to them.

A model judges it (the ``voice_confirmation`` program, through the iron rules like every other
call): whether what the voice model said kept the summary's meaning (it may reword, as long as
the meaning is not bent) and whether the student agreed. The word list (voice_answer)
helps: it is the answer when no model can be called, and a plain no it hears overrides
the model's yes. A verbatim reading needs no model to be faithful; a cut-off one never is.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Any, Literal

from app.modules.identity_access.repositories import Account
from app.modules.llm_runtime.contracts import VoiceConfirmation
from app.modules.solo_activity import service
from app.modules.solo_activity.voice_answer import classify
from app.modules.solo_activity.voice_confirmation import Verdict
from app.modules.solo_activity.voice_readout import heard_as_read, says

PROGRAM = "voice_confirmation"
ENDPOINT = "solo.voice_confirmation"


@dataclass(frozen=True)
class Judgment:
    verdict: Verdict
    faithful: bool
    vetoed: bool
    quote: str
    source: Literal["model", "word_list"]

    def audit(self) -> dict[str, Any]:
        return asdict(self)


def prepare(
    db: Any,
    account: Account,
    attempt_id: str,
    *,
    summary: dict[str, Any],
    heard: str,
    said: str,
) -> dict[str, Any] | None:
    """What the judging call needs; None when the course has no model to call."""
    row = service._locked_attempt(db, account, attempt_id)
    activity = db.get(service.Activity, row.activity_id)
    course = db.get(service.Course, activity.course_id)
    bindings = service.course_bindings(db, course, service.ROLE)
    if not bindings:
        return None
    context = {
        "summary": summary,
        "spoken": heard,
        "student_text": said,
        "output_locale": account.locale or service.DEFAULT_LOCALE,
    }
    messages, schema, _ = service.compile_program(db, PROGRAM, context)
    return {
        "account_id": account.id,
        "bindings": bindings,
        "messages": messages,
        "schema": schema,
        "context": context,
    }


async def judge(
    prepared: dict[str, Any] | None,
    *,
    expected: str,
    parts: list[str],
    heard: str,
    interrupted: bool,
    said: str,
    locale: str,
) -> Judgment:
    verbatim = not interrupted and heard_as_read(expected, heard, parts)
    words = classify(said, locale)
    called = None
    if prepared is not None:
        called = await service._call_program(prepared, PROGRAM, VoiceConfirmation, ENDPOINT)
    if called is None:
        return Judgment(words, verbatim, False, "", "word_list")
    result: VoiceConfirmation = called[0]
    verdict: Verdict = result.verdict
    # A yes must rest on words the student actually said.
    if verdict == "agree" and not says(said, result.quote):
        verdict = "unclear"
    faithful = not interrupted and (verbatim or result.faithful)
    vetoed = verdict == "agree" and words == "disagree"
    return Judgment(verdict, faithful, vetoed, result.quote, "model")
