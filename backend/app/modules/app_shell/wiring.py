"""Cross-module wiring: higher modules register their handlers into the lower modules' hook points.

Lower modules never import the modules above them; when they need to ask or tell those modules
something, they expose a registry and the app shell — the one layer allowed to know everyone —
connects them here, once, on import.
"""

from app.modules.ai_providers.account_records import HOOK as provider_account_records
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
from app.modules.course_management.enrollment import (
    register_enrollment_hook,
    registered_enrollment_hooks,
)
from app.modules.course_management.account_records import HOOK as course_account_records
from app.modules.course_management.guest_records import HOOK as course_guest_records
from app.modules.identity_access.service import (
    register_account_hook,
    register_guest_hook,
    registered_account_hooks,
    registered_guest_hooks,
)
from app.modules.notifications.guest_records import HOOK as notification_guest_records
from app.modules.solo_activity.enrollment_records import HOOK as solo_enrollment_records
from app.modules.solo_activity.guest_records import HOOK as solo_guest_records

# Every module that keeps a guest's records. Without one, logging in would leave that module's
# records with the guest, and expiry would keep the guest's name there.
REQUIRED_GUEST_HOOKS = frozenset({"course-management", "solo-activity", "notifications"})
# Every module that keeps a student's answers in a course's activities. Without one, removing a
# student from a course would leave that module's answers behind.
REQUIRED_ENROLLMENT_HOOKS = frozenset({"solo-activity"})
# Every module that keeps something tied to an account. Without one, deleting an account would
# leave that module's secrets behind, or delete a teacher who still owns courses.
REQUIRED_ACCOUNT_HOOKS = frozenset({"ai-providers", "course-management"})


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
    register_guest_hook("course-management", course_guest_records)
    register_guest_hook("solo-activity", solo_guest_records)
    register_guest_hook("notifications", notification_guest_records)
    register_enrollment_hook("solo-activity", solo_enrollment_records)
    register_account_hook("ai-providers", provider_account_records)
    register_account_hook("course-management", course_account_records)


def check_guest_hooks() -> None:
    """Refuse to start when a module that keeps guest records has not registered its hook."""
    missing = REQUIRED_GUEST_HOOKS - registered_guest_hooks()
    if missing:
        raise RuntimeError("guest record hooks not registered: " + ", ".join(sorted(missing)))


def check_enrollment_hooks() -> None:
    """Refuse to start when a module that keeps students' answers has not registered its hook."""
    missing = REQUIRED_ENROLLMENT_HOOKS - registered_enrollment_hooks()
    if missing:
        raise RuntimeError("enrollment record hooks not registered: " + ", ".join(sorted(missing)))


install()


def check_account_hooks() -> None:
    """Refuse to start when a module that keeps account records has not registered its hook."""
    missing = REQUIRED_ACCOUNT_HOOKS - registered_account_hooks()
    if missing:
        raise RuntimeError("account record hooks not registered: " + ", ".join(sorted(missing)))
