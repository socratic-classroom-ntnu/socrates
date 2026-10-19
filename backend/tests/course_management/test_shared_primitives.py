def test_domain_error_is_one_class():
    from app.modules.classroom_core.orchestrator.classroom import DomainError as old
    from app.modules.platform.errors import DomainError as new

    assert new is old


def test_account_and_limit_moved_without_copy():
    from app.modules.classroom_core.api import request_account as old
    from app.modules.classroom_core.services import classroom
    from app.modules.identity_access.api import request_account as new
    from app.modules.platform.services import rate_limit

    assert old.account is new.account
    assert old.same_origin is new.same_origin
    assert classroom.limit is rate_limit.limit
