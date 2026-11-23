"""Deleting an account: who may, and what is left afterwards.

The account row stays under a placeholder name, so answers and enrollments still count; names,
email, password, avatar, sessions, email tokens and AI keys go.
"""

import base64

from sqlalchemy import select

from app.modules.ai_providers.repositories import (
    AccountAISettings,
    ProviderProfile,
    SessionProviderSecret,
)
from app.modules.course_management.repositories import Enrollment
from app.modules.identity_access.repositories import (
    Account,
    EmailToken,
    LoginSession,
    Mail,
    MailDelivery,
)
from app.modules.platform import storage
from tests.course_management.conftest import switch, user
from tests.course_management.test_courses_api import create_course

DELETE_URL = "/api/v2/account"


def delete_account(client, username):
    return client.request("DELETE", DELETE_URL, json={"username": username})


def account_row(username):
    with storage.transaction() as db:
        row = db.scalar(select(Account).where(Account.username == username))
        assert row is not None
        db.expunge(row)
        return row


def test_a_student_is_anonymized_but_keeps_their_enrollment(client):
    teacher = user(client, "owner", account_role="teacher")
    course = create_course(client)
    user(client, "learner")
    joined = client.post(
        "/api/v2/courses/join", json={"code": course["code"], "display_name": "林同學"}
    )
    assert joined.status_code in (200, 201), joined.text
    client.patch("/api/v2/account/profile", json={"display_name": "小林"})
    client.put(
        "/api/v2/account/avatar",
        json={"mime": "image/jpeg", "data_base64": base64.b64encode(b"\xff\xd8\xff..").decode()},
    )
    learner_id = account_row("learner").id

    deleted = delete_account(client, "learner")

    assert deleted.status_code == 200, deleted.text
    assert deleted.json() == {"status": "ACCOUNT_DELETED"}
    with storage.transaction() as db:
        row = db.get(Account, learner_id)
        assert row is not None
        assert (row.kind, row.username, row.email, row.password_hash) == (
            "deleted",
            f"deleted-{learner_id}",
            None,
            None,
        )
        assert (row.display_name_override, row.verified, row.platform_role) == (None, False, None)
        enrollment = db.scalar(select(Enrollment).where(Enrollment.account_id == learner_id))
        assert enrollment is not None
        assert enrollment.display_name == ""
    # The session cookie is gone with the account; the teacher still sees the course.
    assert client.get("/api/v2/auth/me").status_code == 401
    switch(client, teacher)


def test_the_username_must_match(client):
    user(client, "learner")

    response = delete_account(client, "someone-else")

    assert response.status_code == 400
    assert response.json()["detail"] == "ACCOUNT_USERNAME_MISMATCH"
    assert account_row("learner").kind == "registered"


def test_the_username_check_ignores_case_and_spaces(client):
    user(client, "learner")

    assert delete_account(client, "  LEARNER ").status_code == 200


def test_a_teacher_who_owns_a_course_cannot_delete(client):
    user(client, "owner", account_role="teacher")
    create_course(client, name="軟體工程")

    check = client.get("/api/v2/account/deletion-check")
    assert check.json() == {"can_delete": False, "courses": ["軟體工程"]}
    response = delete_account(client, "owner")

    assert response.status_code == 409
    assert response.json()["detail"] == "ACCOUNT_HAS_COURSES"
    assert account_row("owner").kind == "registered"


def test_sessions_tokens_and_ai_keys_go(client):
    user(client, "learner")
    learner = account_row("learner")
    with storage.transaction() as db:
        session_hash = db.scalar(
            select(LoginSession.token_hash).where(LoginSession.account_id == learner.id)
        )
        profile = ProviderProfile(
            owner_id=learner.id,
            name="mine",
            adapter="openai",
            default_model="m",
            encrypted_secret="secret",
            secret_last4="1234",
        )
        db.add(profile)
        db.flush()
        profile_id = profile.id
        db.add(AccountAISettings(owner_id=learner.id, default_profile_id=profile_id))
        db.add(
            SessionProviderSecret(
                profile_id=profile_id,
                session_token_hash=session_hash,
                encrypted_secret="session-secret",
                secret_last4="5678",
                expires_at=9_999_999_999,
            )
        )

    assert delete_account(client, "learner").status_code == 200

    with storage.transaction() as db:
        assert (
            db.scalars(select(LoginSession).where(LoginSession.account_id == learner.id)).all()
            == []
        )
        assert db.scalars(select(EmailToken).where(EmailToken.account_id == learner.id)).all() == []
        assert db.scalars(select(SessionProviderSecret)).all() == []
        assert db.get(AccountAISettings, learner.id) is None
        kept = db.get(ProviderProfile, profile_id)
        assert kept is not None
        assert (kept.encrypted_secret, kept.secret_last4, kept.enabled) == (None, None, False)


def test_mail_to_the_account_is_cancelled_and_emptied(client):
    user(client, "learner")
    learner_id = account_row("learner").id

    assert delete_account(client, "learner").status_code == 200

    with storage.transaction() as db:
        rows = db.execute(
            select(Mail, MailDelivery).join(MailDelivery, MailDelivery.mail_id == Mail.id)
        ).all()
        assert rows
        for mail, delivery in rows:
            assert mail.recipient != "learner@example.org"
            assert mail.body == "REDACTED"
            assert delivery.account_id != learner_id
            assert delivery.html_body is None


def test_the_name_and_email_can_be_registered_again(client):
    user(client, "learner")
    assert delete_account(client, "learner").status_code == 200

    user(client, "learner")

    assert account_row("learner").kind == "registered"
