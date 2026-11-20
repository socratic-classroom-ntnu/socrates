"""Public entry point of the course_management module.

Other modules (solo_activity) read activities and enrollments through these names, not through the
internal files.
"""

from app.modules.course_management.activities import (  # noqa: F401
    current_revision as current_revision,
    get_activity as get_activity,
    lock_current_revision as lock_current_revision,
)
from app.modules.course_management.enrollment import existing as existing_enrollment  # noqa: F401
from app.modules.course_management.enrollment import locked as locked_enrollment  # noqa: F401
from app.modules.course_management.practice import (  # noqa: F401
    BANK_PATH as PRACTICE_BANK_PATH,
    BankItem as BankItem,
    bank as practice_bank,
    bank_item as practice_bank_item,
    install_bank as install_practice_bank,
    check_settings as check_practice_settings,
    practice_owner as practice_owner,
    lock_practice_owner as lock_practice_owner,
    practice_course as practice_course,
    ensure_practice_course as ensure_practice_course,
    create_practice_activity as create_practice_activity,
    practice_activities as practice_activities,
    created_today as practice_created_today,
    daily_limit as practice_daily_limit,
    display_title as practice_display_title,
)
