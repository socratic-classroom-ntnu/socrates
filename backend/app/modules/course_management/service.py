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
