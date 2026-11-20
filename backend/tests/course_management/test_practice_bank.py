"""The main-flow question bank behind 我的對話: one file, checked at startup (spec §10 M6, M7)."""

from pathlib import Path

import pytest

from app.classroom_app import create_app
from app.modules.course_management import practice

# spec §10.5：首批六題，逐字對照畫布
EXPECTED = [
    (
        "llm-school",
        "語言模型與學校學習",
        "tech",
        "請問在 2026 年的現在，我們在學校的學習（作業與考試）是不是也要開放使用語言模型作為我們的輔助工具？",
    ),
    (
        "trolley",
        "電車難題",
        "life",
        "一輛失控的電車正駛向五名工人。你站在轉轍器旁，拉下拉桿，電車會轉向另一條軌道，那裡只有一名工人。你會拉下拉桿嗎？",
    ),
    (
        "lie-to-save-friend",
        "說謊救朋友",
        "honesty",
        "你的朋友為了躲一個想傷害他的人，躲進了你家。那個人敲門，問你朋友在不在裡面。你會說謊嗎？",
    ),
    (
        "ship-of-theseus",
        "忒修斯之船",
        "self",
        "一艘船的木板一塊塊換掉，全部換完之後，它還是同一艘船嗎？",
    ),
    (
        "experience-machine",
        "經驗機器",
        "tech",
        "有一台機器能讓你一輩子都感到幸福，但一切都不是真的。你會接上嗎？",
    ),
    (
        "footbridge",
        "天橋上的陌生人",
        "life",
        "失控的電車駛向五個人。你站在天橋上，旁邊有一個陌生人，把他推下去就能擋住電車。你會推嗎？",
    ),
]

GOOD = """
- id: trolley
  title: 電車難題
  body: 你會拉下拉桿嗎？
  category: life
  recommended: true
"""


def write(tmp_path: Path, text: str) -> Path:
    path = tmp_path / "bank.yaml"
    path.write_text(text, encoding="utf-8")
    return path


def test_the_shipped_bank_is_the_six_canvas_topics_in_order():
    items = practice.load_bank()
    assert [(i.id, i.title, i.category, i.body) for i in items] == EXPECTED
    assert all(i.recommended for i in items)


def test_a_small_valid_file_loads(tmp_path):
    (item,) = practice.load_bank(write(tmp_path, GOOD))
    assert (item.id, item.title, item.body, item.category, item.recommended) == (
        "trolley",
        "電車難題",
        "你會拉下拉桿嗎？",
        "life",
        True,
    )


@pytest.mark.parametrize(
    "text",
    [
        "",  # empty file
        "[]",  # empty list
        "trolley: 電車難題",  # not a list
        "- id: trolley\n  title: 電車難題\n  category: life\n  recommended: true",  # missing body
        GOOD + GOOD,  # duplicate id
        GOOD.replace("id: trolley", "id: Trolley_1"),  # id format
        GOOD.replace("title: 電車難題", "title: '   '"),  # blank title
        GOOD.replace("title: 電車難題", "title: " + "題" * 41),  # title too long
        GOOD.replace("body: 你會拉下拉桿嗎？", "body: ''"),  # blank body
        GOOD.replace("body: 你會拉下拉桿嗎？", "body: " + "字" * 301),  # body too long
        GOOD.replace("category: life", "category: ethics"),  # unknown category
        GOOD.replace("recommended: true", "recommended: 'yes'"),  # wrong type
        GOOD.replace("recommended: true", "recommended: false"),  # no recommended topic
        GOOD + "  extra: 1\n",  # unknown field
    ],
)
def test_a_broken_file_is_rejected(tmp_path, text):
    with pytest.raises(ValueError):
        practice.load_bank(write(tmp_path, text))


def test_a_broken_bank_stops_the_service_from_starting(tmp_path, monkeypatch):
    from app.modules.course_management import service

    monkeypatch.setattr(service, "PRACTICE_BANK_PATH", write(tmp_path, "[]"))
    with pytest.raises(ValueError):
        create_app(background=False)


@pytest.mark.parametrize(
    ("name", "value"),
    [
        ("SOCRATES_PRACTICE_DAILY_LIMIT", ""),
        ("SOCRATES_PRACTICE_DAILY_LIMIT", "five"),
        ("SOCRATES_PRACTICE_DAILY_LIMIT", "-1"),
        # 0 會讓每位學生一進來就只能看「明天再來」；要停用請把平台金鑰留空
        ("SOCRATES_PRACTICE_DAILY_LIMIT", "0"),
        ("SOCRATES_PRACTICE_TIMEZONE", "Asia/Taipe"),
        ("SOCRATES_PRACTICE_TIMEZONE", ""),
    ],
)
def test_a_bad_daily_limit_or_timezone_stops_the_service_from_starting(monkeypatch, name, value):
    """設定錯誤在部署當下就起不來，不要等到學生打開我的對話才 500（M3、M7 同一原則）。"""
    monkeypatch.setenv(name, value)
    with pytest.raises(ValueError, match=name):
        create_app(background=False)


def test_a_valid_daily_limit_and_timezone_start_fine(monkeypatch):
    monkeypatch.setenv("SOCRATES_PRACTICE_DAILY_LIMIT", "1")
    monkeypatch.setenv("SOCRATES_PRACTICE_TIMEZONE", "UTC")
    create_app(background=False)
