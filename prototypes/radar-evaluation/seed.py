"""The class: a teacher, a course, one activity named NARRATIVE on scenario S1, and the 16 students of students.py.

Accounts, the course, the activity and each student's attempt go through the API, as a teacher and
students would make them. What the students said and confirmed is written straight into each
attempt: both scenarios (S2 as if extended already), their messages, the confirmed summaries, and
the attempt left in the review, where the app writes the final summary next (finals.py).

    python seed.py
"""

from __future__ import annotations

import time
from dataclasses import asdict

from lab import CLASS_FILE, TEACHER, Api, write_json
from app.modules.platform import storage
from app.modules.solo_activity.attempt_machine import ScenarioProgress
from app.modules.solo_activity.repositories import SoloAttempt, SoloMessage
from students import NARRATIVE, S1, STUDENTS

YEAR = 365 * 24 * 3600


def _write_attempt(attempt_id: str, student: dict) -> None:
    with storage.transaction() as db:
        row = db.get(SoloAttempt, attempt_id, with_for_update=True)
        if row.state != "answering" or row.progress[0]["text"] != S1:
            raise RuntimeError(f"{student['name']}: attempt is not a fresh one on S1")
        progress, seq = [], 0
        for index, (text, said, confirmed) in enumerate(student["scenarios"]):
            progress.append(
                ScenarioProgress(
                    scenario_id=f"s{index + 1}",
                    text=text,
                    answer=said[0],
                    turn_index=len(said),
                    status="goal_met",
                    confirmed_summary=confirmed,
                )
            )
            for words in said:
                seq += 1
                db.add(
                    SoloMessage(
                        attempt_id=row.id,
                        seq=seq,
                        scenario_index=index,
                        role="student",
                        text=words,
                    )
                )
        row.progress = [asdict(item) for item in progress]
        row.scenario_index = len(progress) - 1
        row.state = "reviewing"
        row.updated_at = time.time()


def main() -> None:
    if CLASS_FILE.exists():
        raise SystemExit(f"{CLASS_FILE} exists: this database already has the class")
    teacher = Api().register(TEACHER, role="teacher")
    course = teacher.post("/api/v2/courses", json={"name": "雷達實測", "teacher_name": "雷達實測"})
    activity = teacher.post(
        f"/api/v2/courses/{course['id']}/activities",
        json={"title": NARRATIVE, "scenario": S1, "ends_at": time.time() + YEAR},
    )
    teacher.post(f"/api/v2/activities/{activity['id']}/publish")
    students = []
    for number, student in enumerate(STUDENTS, start=1):
        username = f"radar_s{number:02d}"
        api = Api().register(username)
        api.post(
            "/api/v2/courses/join", json={"code": course["code"], "display_name": student["name"]}
        )
        attempt = api.post(f"/api/v2/solo/activities/{activity['id']}/attempt")
        _write_attempt(attempt["id"], student)
        students.append(
            {"name": student["name"], "username": username, "attempt_id": attempt["id"]}
        )
        print(f"{number:2d} {student['name']}")
    write_json(
        CLASS_FILE,
        {
            "teacher": TEACHER,
            "course_id": course["id"],
            "course_code": course["code"],
            "activity_id": activity["id"],
            "students": students,
        },
    )
    print(f"activity {activity['id']} → {CLASS_FILE}")


if __name__ == "__main__":
    main()
