"""Owner-scope rules for a question's scenario_ai (per-question provider profile + model).

The pydantic Question contract checks shape (both fields non-empty); these checks need the DB:
the named provider profile must exist and belong to the script owner.
"""

from __future__ import annotations

from copy import deepcopy

from sqlalchemy import select

from app.orchestrator.classroom import DomainError


def _owned_profile_ids(db, owner_id: str, profile_ids: set[str]) -> set[str]:
    from app.api.routes.provider_profiles import ProviderProfile

    if not profile_ids:
        return set()
    return set(
        db.scalars(
            select(ProviderProfile.id).where(
                ProviderProfile.owner_id == owner_id,
                ProviderProfile.id.in_(profile_ids),
            )
        )
    )


def _referenced(document: dict) -> set[str]:
    return {
        str(question["scenario_ai"]["provider_profile_id"])
        for question in document.get("questions", [])
        if isinstance(question, dict) and question.get("scenario_ai")
    }


def validate_scenario_ai(db, owner_id: str, document: dict) -> None:
    """Raise SCENARIO_AI_PROFILE_REQUIRED when a question names a profile the owner lacks."""
    wanted = _referenced(document)
    if wanted - _owned_profile_ids(db, owner_id, wanted):
        raise DomainError("SCENARIO_AI_PROFILE_REQUIRED", 422)


def prune_scenario_ai(db, owner_id: str, question: dict) -> dict:
    """Copy of a question keeping scenario_ai only while its profile is still the owner's."""
    value = deepcopy(question)
    scenario = value.get("scenario_ai")
    if scenario and not _owned_profile_ids(db, owner_id, {str(scenario["provider_profile_id"])}):
        value.pop("scenario_ai", None)
    return value
