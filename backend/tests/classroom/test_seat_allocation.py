from app.modules.classroom_core.repositories import next_seat


class _DB:
    def __init__(self, stored):
        self.stored = stored

    def scalar(self, _query):
        return self.stored


def test_seat_after_clearing_ai_students_skips_remaining_member():
    # 加 AI（座位 0）→ 真人入座（座位 1）→ 清除 AI：只剩座位 1；再加 AI 要拿 2，不能拿 1。
    members = {"human": {"seat": 1}}
    assert next_seat(_DB(1), "room", members) == 2


def test_seat_uses_database_when_state_is_behind():
    assert next_seat(_DB(3), "room", {}) == 4


def test_first_seat_is_zero_and_teacher_without_seat_is_ignored():
    assert next_seat(_DB(None), "room", {"teacher": {"seat": None}}) == 0
