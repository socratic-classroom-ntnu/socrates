from app.config import settings
from app.ladders.repository import LadderRepository


def test_loads_all_stages_in_order():
    repo = LadderRepository.load("tests/fixtures/two_stage.yaml")
    ladder = repo.get()
    assert ladder.id == "fixture"
    assert [s.key for s in ladder.stages] == ["first", "second"]
    assert repo.stage(1).title == "第二個情境"


def test_opening_statement_is_preserved_verbatim():
    repo = LadderRepository.load("tests/fixtures/two_stage.yaml")
    assert repo.stage(0).opening_statement == "一輛電車失控了。\n你會怎麼做？\n"


def test_public_trolley_ladder_has_three_stages_in_teaching_order():
    repo = LadderRepository.load(settings.ladder_path)

    assert [stage.key for stage in repo.get().stages] == [
        "trolley_basic",
        "footbridge",
        "transplant",
    ]
    assert all(
        stage.opening_statement.strip().endswith("你會怎麼做？") for stage in repo.get().stages
    )
