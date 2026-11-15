"""The app shell wires every module that keeps guest records, and runs guest expiry.

A module left out would keep a guest's records on login and their name after expiry, so the app
refuses to start without it, in tests too. expire_guests locks each account and is safe to run
again, so every pod may run the hourly loop without keeping a last-run time.
"""

import asyncio
import time

import pytest
from sqlalchemy import select

from app.classroom_app import create_app
from app.modules.app_shell import llm_workers
from app.modules.app_shell import wiring
from app.modules.course_management.repositories import Enrollment
from app.modules.identity_access import guests
from app.modules.identity_access.auth import GUEST_SECONDS
from app.modules.identity_access.repositories import Account
from app.modules.platform import storage as storage
from app.modules.solo_activity.repositories import SoloAttempt, SoloMessage
from tests.course_management.conftest import client  # noqa: F401  the app fixture
from tests.solo_activity.conftest import tutor  # noqa: F401  the scripted provider
from tests.solo_activity.test_solo_attempts_api import OPENING, answer, ok, start
from tests.solo_activity.test_solo_guests import join_as_guest, setup


def test_both_guest_record_modules_are_wired():
    assert (
        set(guests.GUEST_HOOKS)
        >= wiring.REQUIRED_GUEST_HOOKS
        == {
            "course-management",
            "solo-activity",
        }
    )


def test_the_app_refuses_to_start_without_one(monkeypatch):
    hooks = dict(guests.GUEST_HOOKS)
    hooks.pop("solo-activity")
    monkeypatch.setattr(guests, "GUEST_HOOKS", hooks)
    with pytest.raises(RuntimeError, match="solo-activity"):
        create_app(background=False)


def test_expiry_clears_the_name_and_keeps_the_answers(client, tutor):  # noqa: F811
    _, replies = tutor
    s = setup(client)
    guest = join_as_guest(client, s)
    attempt = ok(start(client, s["activity_id"]))
    replies.append(OPENING)
    answer(client, attempt["id"], "訪客的回答")
    expired = guests.expire_guests(now=time.time() + GUEST_SECONDS + 1)
    assert expired == [guest["id"]]
    with storage.transaction() as db:
        account = db.get(Account, guest["id"])
        assert account.kind == "expired_guest"
        names = db.scalars(
            select(Enrollment.display_name).where(Enrollment.account_id == guest["id"])
        ).all()
        assert names == [""]
        assert db.get(SoloAttempt, attempt["id"]) is not None
        said = db.scalars(select(SoloMessage.text).where(SoloMessage.attempt_id == attempt["id"]))
        assert "訪客的回答" in said.all()


def test_the_expiry_loop_runs_every_hour_and_survives_a_failed_run(monkeypatch):
    runs: list[str] = []
    waits: list[float] = []

    def expire():
        runs.append("run")
        if len(runs) == 1:
            raise RuntimeError("database down")
        return []

    async def sleep(seconds):
        waits.append(seconds)
        if len(waits) == 2:
            raise asyncio.CancelledError

    monkeypatch.setattr(llm_workers, "expire_guests", expire)
    monkeypatch.setattr(llm_workers.asyncio, "sleep", sleep)
    with pytest.raises(asyncio.CancelledError):
        asyncio.run(llm_workers.guest_expiry_loop())
    assert runs == ["run", "run"]
    assert waits == [3600, 3600]
