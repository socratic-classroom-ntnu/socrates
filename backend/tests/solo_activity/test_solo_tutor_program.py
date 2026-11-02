"""The solo_tutor prompt: B5's rules live there, and the group's personal_tutor is untouched."""

import json

from app.modules.llm_runtime import iron_rules, prompts
from app.modules.llm_runtime.prompts import ROOT, validate_programs


def _template(kind: str) -> str:
    spec = json.loads((ROOT / "prompts/classroom/programs.json").read_text())
    return spec["programs"][kind]["template"]


def test_programs_validate():
    validate_programs()
    solo = _template("solo_tutor")
    for key in ("hypothetical", "principle_note", "revise_hint", "stance_changed_from"):
        assert key in solo, key


def test_group_personal_tutor_is_untouched():
    group = _template("personal_tutor")
    for key in ("principle_note", "revise_hint", "stance_changed_from"):
        assert key not in group, key


def test_solo_reply_style_section():
    """L2: short replies, one question, varied asks, faithful wording; with one good/bad pair."""
    solo = _template("solo_tutor")
    for phrase in ("【回覆風格】", "80 字以內", "只能有一個問號", "好的例子", "壞的例子"):
        assert phrase in solo, phrase
    assert "【回覆風格】" not in _template("personal_tutor")


def test_solo_good_example_obeys_the_hypothetical_rule():
    """The model imitates the good example: it must not change a condition without saying so."""
    solo = _template("solo_tutor")
    good = solo.split("好的例子：「", 1)[1].split("」壞的例子", 1)[0]
    assert good.count("？") == 1, good
    if any(word in good for word in ("如果", "改成", "換成", "假設")):
        assert "延伸情境" in good, good


def test_solo_tutor_is_a_request_program_under_the_iron_rules():
    """Validated at startup like every program, and its system prompt opens with the role's rules."""
    from sqlalchemy.orm import Session

    from app.modules.platform import storage

    assert "solo_tutor" in prompts.REQUEST_PROGRAMS
    engine = storage.configure("sqlite+pysqlite:///:memory:", create=True)
    with Session(engine) as db:
        messages, schema, _ = prompts.compile_program(db, "solo_tutor", {"argument": "x"})
    assert messages[0]["content"].startswith(iron_rules.rules_for("solo_tutor"))
    assert schema is prompts.SCHEMAS["PersonalTutorTurn"]
