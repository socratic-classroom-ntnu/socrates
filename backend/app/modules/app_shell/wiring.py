"""Cross-module wiring: higher modules register their handlers into the lower modules' hook points.

Lower modules never import the modules above them; when they need to ask or tell those modules
something, they expose a registry and the app shell — the one layer allowed to know everyone —
connects them here, once, on import.
"""

from app.modules.ai_providers.service import register_profile_usage_check
from app.modules.identity_access.auth import extend_account_view
from app.modules.classroom_core.service import (
    account_classroom_progress,
    classroom_settings_profile_check,
    register_active_room_ai_settings_handler,
)
from app.modules.classroom_core.orchestrator import register_orchestrator_extension
from app.modules.content_authoring.service import script_profile_check
from app.modules.group_dialogue.ai_students import extend as extend_with_ai_students
from app.modules.group_dialogue.group_run import extend as extend_with_group_runs
from app.modules.group_dialogue.service import ai_student_profile_check, update_ai_student_profiles


def install() -> None:
    # The classroom state machine: group runs first, AI students on top of them.
    register_orchestrator_extension(extend_with_group_runs)
    register_orchestrator_extension(extend_with_ai_students)
    # Deleting a provider profile: reasons are checked in this order.
    register_profile_usage_check(classroom_settings_profile_check)
    register_profile_usage_check(ai_student_profile_check)
    register_profile_usage_check(script_profile_check)
    register_active_room_ai_settings_handler(update_ai_student_profiles)
    extend_account_view(account_classroom_progress)


install()
