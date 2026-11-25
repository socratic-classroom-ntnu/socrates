"""AI providers' account record hook (identity_access.contracts.AccountRecordHook).

A deleted account's AI connection stops: its keys are cleared and its profiles disabled. The
profile rows stay, because group classes, AI students and classroom settings still point at them.
Keys typed for one login session only go before that session does.
"""

from sqlalchemy import delete, update
from sqlalchemy.orm import Session

from app.modules.ai_providers.repositories import (
    AccountAISettings,
    ProviderProfile,
    SessionProviderSecret,
)


class ProviderAccountRecords:
    def blocking_courses(self, db: Session, account_id: str) -> list[str]:
        return []

    def forget_sessions(self, db: Session, token_hashes: list[str]) -> None:
        db.execute(
            delete(SessionProviderSecret).where(
                SessionProviderSecret.session_token_hash.in_(token_hashes)
            )
        )

    def forget_account(self, db: Session, account_id: str) -> None:
        db.execute(delete(AccountAISettings).where(AccountAISettings.owner_id == account_id))
        db.execute(
            update(ProviderProfile)
            .where(ProviderProfile.owner_id == account_id)
            .values(
                encrypted_secret=None,
                secret_last4=None,
                enabled=False,
                base_url=None,
                organization=None,
                project=None,
                metadata_json={},
            )
        )


HOOK = ProviderAccountRecords()
