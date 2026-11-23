from uuid import uuid4
from unittest.mock import MagicMock

import pytest

from app.modules.identity_access.account_deletion import (
    ensure_account_can_be_deleted,
)
from app.modules.platform.errors import DomainError
from app.modules.identity_access.account_deletion import (
    anonymize_account_mail,
)
from app.modules.identity_access.repositories import (
    Mail,
    MailDelivery,
)

def make_account(kind="registered"):
    account = MagicMock()
    account.id = "test-account-id"
    account.kind = kind
    return account


def test_registered_account_without_courses(monkeypatch):
    monkeypatch.setattr(
        "app.modules.identity_access.account_deletion.owned_courses",
        lambda db, account_id: [],
    )

    ensure_account_can_be_deleted(MagicMock(), make_account())


def test_account_with_courses_is_blocked(monkeypatch):
    monkeypatch.setattr(
        "app.modules.identity_access.account_deletion.owned_courses",
        lambda db, account_id: ["軟體工程"],
    )

    with pytest.raises(DomainError) as exc:
        ensure_account_can_be_deleted(MagicMock(), make_account())

    assert exc.value.code == "ACCOUNT_HAS_COURSES"


def test_guest_cannot_delete_account():
    with pytest.raises(DomainError) as exc:
        ensure_account_can_be_deleted(
            MagicMock(),
            make_account(kind="guest"),
        )

    assert exc.value.code == "ACCOUNT_DELETE_UNAVAILABLE"
    from uuid import uuid4

from sqlalchemy import select

from app.modules.course_management.repositories import Course, Enrollment
from app.modules.identity_access.account_deletion import anonymize_account
from app.modules.identity_access.repositories import (
    Account,
    EmailToken,
    LoginSession,
)
from app.modules.ai_providers.repositories import (
    AccountAISettings,
    ProviderProfile,
    SessionProviderSecret,
)


def new_account(db, *, role="student"):
    account = Account(
        id=str(uuid4()),
        username=f"user_{uuid4().hex[:12]}",
        email=f"{uuid4().hex}@example.test",
        password_hash="test-password-hash",
        display_name_override="測試使用者",
        avatar_filename="test-avatar.png",
        verified=True,
        kind="registered",
        account_role=role,
    )
    db.add(account)
    db.flush()
    return account


def test_anonymize_account_preserves_enrollment(db, _create_schema):
    teacher = new_account(db, role="teacher")
    student = new_account(db)

    course = Course(
        id=str(uuid4()),
        owner_id=teacher.id,
        name="測試課程",
        teacher_name="測試老師",
        code=uuid4().hex[:8].upper(),
    )
    db.add(course)
    db.flush()

    enrollment = Enrollment(
        id=str(uuid4()),
        course_id=course.id,
        account_id=student.id,
        display_name="學生原本姓名",
    )
    db.add(enrollment)
    db.flush()

    student_id = student.id
    enrollment_id = enrollment.id

    previous_avatar = anonymize_account(db, student)
    db.flush()

    saved_account = db.get(Account, student_id)
    saved_enrollment = db.get(Enrollment, enrollment_id)

    assert previous_avatar == "test-avatar.png"
    assert saved_account is not None
    assert saved_account.kind == "deleted"
    assert saved_account.username == f"deleted-{student_id}"
    assert saved_account.email is None
    assert saved_account.password_hash is None
    assert saved_account.display_name_override is None
    assert saved_account.avatar_filename is None
    assert saved_account.verified is False
    assert saved_account.platform_role is None

    assert saved_enrollment is not None
    assert saved_enrollment.account_id == student_id
    assert saved_enrollment.course_id == course.id
    assert saved_enrollment.display_name == ""


def test_teacher_with_course_cannot_be_anonymized(db, _create_schema):
    teacher = new_account(db, role="teacher")

    db.add(
        Course(
            id=str(uuid4()),
            owner_id=teacher.id,
            name="軟體工程",
            teacher_name="測試老師",
            code=uuid4().hex[:8].upper(),
        )
    )
    db.flush()

    original_username = teacher.username

    with pytest.raises(DomainError) as exc:
        anonymize_account(db, teacher)

    assert exc.value.code == "ACCOUNT_HAS_COURSES"
    assert teacher.username == original_username
    assert teacher.kind == "registered"


def test_anonymize_account_revokes_tokens_and_ai_secrets(db, _create_schema):
    student = new_account(db)

    session_hash = uuid4().hex
    db.add(
        LoginSession(
            token_hash=session_hash,
            account_id=student.id,
            csrf_token="test-csrf",
            expires_at=9999999999,
        )
    )

    token_hash = uuid4().hex
    db.add(
        EmailToken(
            token_hash=token_hash,
            account_id=student.id,
            purpose="reset",
            expires_at=9999999999,
            consumed=False,
        )
    )

    profile = ProviderProfile(
        id=str(uuid4()),
        owner_id=student.id,
        name="Test Provider",
        adapter="openai",
        default_model="test-model",
        encrypted_secret="encrypted-test-secret",
        secret_last4="1234",
        enabled=True,
    )
    db.add(profile)
    db.flush()

    db.add(
        AccountAISettings(
            owner_id=student.id,
            default_profile_id=profile.id,
        )
    )
    db.add(
        SessionProviderSecret(
            profile_id=profile.id,
            session_token_hash=session_hash,
            encrypted_secret="session-secret",
            secret_last4="5678",
            expires_at=9999999999,
        )
    )
    db.flush()

    anonymize_account(db, student)
    db.flush()
    db.expire_all()

    assert db.get(LoginSession, session_hash) is None
    assert db.get(EmailToken, token_hash) is None
    assert db.get(AccountAISettings, student.id) is None

    assert db.scalar(
        select(SessionProviderSecret).where(
            SessionProviderSecret.profile_id == profile.id
        )
    ) is None

    saved_profile = db.get(ProviderProfile, profile.id)

    assert saved_profile is not None
    assert saved_profile.encrypted_secret is None
    assert saved_profile.secret_last4 is None
    assert saved_profile.enabled is False


def test_anonymization_can_be_rolled_back(db, _create_schema):
    student = new_account(db)
    original_username = student.username

    db.flush()

    try:
        with db.begin_nested():
            anonymize_account(db, student)
            db.flush()

            assert student.kind == "deleted"

            # Simulate an error before the transaction commits.
            raise RuntimeError("simulated failure")
    except RuntimeError:
        pass

    db.refresh(student)

    assert student.kind == "registered"
    assert student.username == original_username
    assert student.email is not None

def test_account_mail_is_anonymized(db):
    student = new_account(db)

    mail = Mail(
        recipient=student.email,
        subject="Verify your email",
        body="Your verification link contains a token",
        state="PENDING",
    )
    db.add(mail)
    db.flush()

    delivery = MailDelivery(
        mail_id=mail.id,
        account_id=student.id,
        purpose="verify",
        html_body="<p>Private verification link</p>",
        preview_url="https://example.test/verify?token=secret",
        idempotency_key="a" * 64,
        provider_status="QUEUED",
    )
    db.add(delivery)
    db.flush()

    anonymize_account_mail(db, student.id)
    db.flush()

    db.refresh(mail)
    db.refresh(delivery)

    assert mail.state == "CANCELLED"
    assert mail.recipient == "deleted@invalid.invalid"
    assert mail.subject == "ACCOUNT_DELETED"
    assert mail.body == "REDACTED"

    assert delivery.account_id is None
    assert delivery.html_body is None
    assert delivery.preview_url is None
    assert delivery.provider_status == "CANCELLED"
    assert delivery.lease is None
