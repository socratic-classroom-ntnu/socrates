import uuid

from app.models import Learner, Session, StageProgress


def test_session_persists_with_stage_progress(db):
    learner = Learner(id=uuid.uuid4())
    db.add(learner)
    db.flush()

    session = Session(
        id=uuid.uuid4(),
        learner_id=learner.id,
        ladder_id="trolley",
        ladder_version=1,
        status="active",
        flow_state="active_in_stage",
        current_stage_index=0,
    )
    db.add(session)
    db.flush()

    db.add(
        StageProgress(
            session_id=session.id,
            stage_index=0,
            stage_key="trolley_basic",
            status="in_progress",
            turn_count=0,
            principle_label="未明",
            position_shifted=False,
        )
    )
    db.flush()

    stored = db.get(Session, session.id)
    assert stored.parent_session_id is None
    assert len(stored.stage_progress) == 1
    assert stored.stage_progress[0].status == "in_progress"
