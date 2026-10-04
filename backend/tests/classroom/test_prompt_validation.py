import json

import pytest

from app.run2 import prompts

JOB_KINDS = [
    "focused_tutor",
    "dynamic_question",
    "question_summary",
    "class_summary",
    "personal_summary",
    "llm_student_turn",
]
ROOT_KEYS = ["version", "skill_set_version", "skills", "programs"]


def broken_root(tmp_path, mutate):
    (tmp_path / "prompts/run2").mkdir(parents=True)
    (tmp_path / "skills/run2").mkdir(parents=True)
    spec = json.loads((prompts.ROOT / "prompts/run2/programs.json").read_text())
    for name in spec["skills"]:
        (tmp_path / "skills/run2" / name).write_text("x")
    mutate(spec)
    (tmp_path / "prompts/run2/programs.json").write_text(json.dumps(spec))
    return tmp_path


def drop_program(kind):
    return lambda spec: spec["programs"].pop(kind)


def drop_root(key):
    return lambda spec: spec.pop(key)


def test_current_programs_are_valid():
    prompts.validate_programs()


@pytest.mark.parametrize(
    "mutate",
    [
        *[drop_program(k) for k in JOB_KINDS],
        *[drop_root(k) for k in ROOT_KEYS],
        lambda s: s["programs"]["focused_tutor"].update(schema="Nope"),
        lambda s: s["programs"]["focused_tutor"].update(template=""),
        lambda s: s["programs"]["focused_tutor"].update(template=None),
        lambda s: s["skills"].append("missing.md"),
    ],
    ids=[
        *[f"missing-program-{k}" for k in JOB_KINDS],
        *[f"missing-root-{k}" for k in ROOT_KEYS],
        "unknown-schema",
        "empty-template",
        "non-string-template",
        "missing-skill-file",
    ],
)
def test_broken_programs_are_rejected(tmp_path, monkeypatch, mutate):
    monkeypatch.setattr(prompts, "ROOT", broken_root(tmp_path, mutate))
    with pytest.raises(RuntimeError):
        prompts.validate_programs()


def test_invalid_json_is_rejected(tmp_path, monkeypatch):
    root = broken_root(tmp_path, lambda spec: None)
    (root / "prompts/run2/programs.json").write_text("{ not json")
    monkeypatch.setattr(prompts, "ROOT", root)
    with pytest.raises(RuntimeError):
        prompts.validate_programs()


def test_create_app_refuses_to_start_with_broken_programs(monkeypatch):
    from app.run2 import server

    def boom():
        raise RuntimeError("broken")

    monkeypatch.setattr(prompts, "validate_programs", boom)
    with pytest.raises(RuntimeError):
        server.create_app(background=False)
