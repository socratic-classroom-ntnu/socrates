from app.modules.course_management.domain.codes import new_code, normalize


def test_new_code_shape():
    codes = [new_code() for _ in range(200)]

    assert all(
        len(code) == 8 and set(code) <= set("ABCDEFGHJKLMNPQRSTUVWXYZ23456789") for code in codes
    )


def test_normalize():
    assert normalize(" 3cktge7q ") == "3CKTGE7Q"
