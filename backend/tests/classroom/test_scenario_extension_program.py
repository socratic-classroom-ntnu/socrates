"""scenario_extension: the solo activity's next scenario, written under the iron rules."""

import json

from app.modules.llm_runtime import iron_rules, prompts
from app.modules.llm_runtime.contracts import ScenarioExtension


def test_is_a_request_program_with_its_own_rules():
    prompts.validate_programs()
    assert "scenario_extension" in prompts.REQUEST_PROGRAMS
    assert "兩難必須保留" in iron_rules.rules_for("scenario_extension")


def test_a_failed_check_is_an_error_not_a_canned_scenario():
    """No fallback sentence: solo-activity owns what the student sees when generation fails."""
    route = iron_rules.role("scenario_extension")
    assert route["checks"] == ["no_leak"]
    assert route["fallback"] is None


def test_template_names_every_input_and_output_field():
    spec = json.loads((prompts.ROOT / "prompts/classroom/programs.json").read_text())
    entry = spec["programs"]["scenario_extension"]
    assert prompts.SCHEMAS[entry["schema"]] is ScenarioExtension
    inputs = ("scenario", "earlier_scenarios", "confirmed", "student_messages", "output_locale")
    outputs = ("change.before", "change.after", "sources", "message_ref", "quote")
    for key in (*inputs, *outputs):
        assert key in entry["template"], key
