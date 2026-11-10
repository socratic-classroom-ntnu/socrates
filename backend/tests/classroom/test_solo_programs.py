"""The solo activity's programs: each has its own L2, the leak check, and names the inputs it reads."""

import json

import pytest

from app.modules.llm_runtime import iron_rules, prompts

# program → the context keys its caller sends (course-management or solo-activity).
INPUTS = {
    "activity_expansion": ("narrative", "output_locale"),
    "stance_classify": ("narrative", "stances", "student_text", "output_locale"),
    "final_summary": ("scenarios", "confirmed", "student_messages", "stances", "output_locale"),
    "radar_axis_naming": ("narrative", "axes", "low_end", "high_end", "output_locale"),
    "radar_dimensions": ("narrative", "stances", "output_locale"),
    "radar_scoring": ("dimensions", "final_summary", "student_messages"),
}
CITING = ("final_summary", "radar_scoring")


def template(kind: str) -> str:
    spec = json.loads((prompts.ROOT / "prompts/classroom/programs.json").read_text())
    return spec["programs"][kind]["template"]


@pytest.mark.parametrize("kind", INPUTS)
def test_routed_to_its_own_rules_with_the_leak_check(kind):
    prompts.validate_programs()
    assert kind in prompts.REQUEST_PROGRAMS
    route = iron_rules.role(kind)
    assert route["L2"] == f"L2/{kind}.md" and route["fallback"] is None
    assert route["checks"][0] == "no_leak"
    assert ("citations" in route["checks"]) == (kind in CITING)


@pytest.mark.parametrize("kind", INPUTS)
def test_template_names_every_input(kind):
    for key in INPUTS[kind]:
        assert key in template(kind), key


@pytest.mark.parametrize("kind", CITING)
def test_citing_programs_quote_verbatim_from_the_given_refs(kind):
    assert "逐字複製" in template(kind)
    assert "student_messages 裡的 ref" in template(kind)


def test_every_role_writes_in_the_output_locale():
    assert "output_locale" in iron_rules.rules_for("focused_tutor")
