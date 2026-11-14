"""Public entry point of the identity_access module."""

# Public surface for other modules (they import from service, not from these files).
from app.modules.identity_access.auth import (  # noqa: E402
    COOKIE as COOKIE,
    create_guest as create_guest,
    display_name as display_name,
    identity as identity,
)
from app.modules.identity_access.dependencies import (  # noqa: E402
    account as account,
    auth_limit as auth_limit,
    same_origin as same_origin,
    set_session_cookie as set_session_cookie,
)
from app.modules.identity_access.email_delivery import (  # noqa: E402
    apply_resend_webhook as apply_resend_webhook,
)
from app.modules.identity_access.guests import (  # noqa: E402
    expire_guests as expire_guests,
    merge_guest_records as merge_guest_records,
    register_guest_hook as register_guest_hook,
    registered_guest_hooks as registered_guest_hooks,
)
