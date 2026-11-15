"""私人課程（我的對話）對課程的其他入口一律看不見（spec §10 M14，語意掃描 §10.3）。

為了確定擋住它的是「私人課程」這個判斷，而不是剛好代碼停用、或擁有者是系統帳號，
測試先把私人課程的代碼打開。
"""

from app.modules.ai_providers import service as ai_service
from app.modules.app_shell import practice_startup
from app.modules.course_management.repositories import Activity, Course
from app.modules.platform import storage
from tests.course_management.conftest import switch, user

KEY = {
    "SOCRATES_PRACTICE_LLM_API_KEY": "sk-or-v1-platform-key-0001",
    "SOCRATES_PRACTICE_LLM_MODEL": "m",
}


def private_course(client):
    """ming 開一段對話；回傳私人課程與活動，代碼已強制打開。"""
    with storage.transaction() as db:
        practice_startup.prepare_practice(db, ai_service.platform_profile_config(KEY))
    ming = user(client, "ming")
    started = client.post("/api/v2/solo/practice", json={"bank_item_id": "trolley"})
    assert started.status_code == 201, started.text
    with storage.transaction() as db:
        activity = db.get(Activity, started.json()["activity_id"])
        course = db.get(Course, activity.course_id)
        course.code_enabled = True
        return ming, course.id, course.code, activity.id


def test_the_private_course_is_in_no_course_list(client):
    ming, course_id, _, _ = private_course(client)
    lists = client.get("/api/v2/courses").json()
    assert lists == {"teaching": [], "learning": []}


def test_the_student_cannot_open_the_private_course_pages(client):
    _, course_id, _, _ = private_course(client)
    for url in (
        f"/api/v2/courses/{course_id}",
        f"/api/v2/courses/{course_id}?role=student",
        f"/api/v2/courses/{course_id}?role=teacher",
        f"/api/v2/courses/{course_id}/activities",
        f"/api/v2/courses/{course_id}/activities?role=student",
    ):
        assert client.get(url).status_code == 404, url


def test_nobody_can_join_or_preview_a_private_course_by_code(client):
    _, _, code, _ = private_course(client)
    user(client, "hua")
    assert client.get(f"/api/v2/course-join/preview?code={code}").status_code == 404
    assert client.get(f"/api/v2/course-join/public-preview?code={code}").status_code == 404
    joined = client.post("/api/v2/courses/join", json={"code": code, "display_name": "華"})
    assert joined.status_code == 404


def test_nobody_can_join_or_preview_a_private_activity(client):
    _, _, _, activity_id = private_course(client)
    user(client, "hua")
    assert client.get(f"/api/v2/activities/{activity_id}/join-preview").status_code == 404
    assert client.get(f"/api/v2/activities/{activity_id}/public-preview").status_code == 404
    joined = client.post(f"/api/v2/activities/{activity_id}/join", json={"display_name": "華"})
    assert joined.status_code == 404


def test_teacher_side_apis_do_not_see_a_private_activity(client):
    _, _, _, activity_id = private_course(client)
    user(client, "owner", account_role="teacher")
    for url in (
        f"/api/v2/activities/{activity_id}",
        f"/api/v2/solo/activities/{activity_id}/progress",
        f"/api/v2/solo/activities/{activity_id}/analysis",
    ):
        assert client.get(url).status_code == 404, url


def test_another_student_cannot_open_someone_elses_private_activity(client):
    ming, _, _, activity_id = private_course(client)
    user(client, "hua")
    assert client.get(f"/api/v2/solo/activities/{activity_id}").status_code == 404
    assert client.post(f"/api/v2/solo/activities/{activity_id}/attempt").status_code == 404
    switch(client, ming)
    assert client.get(f"/api/v2/solo/activities/{activity_id}").status_code == 200
