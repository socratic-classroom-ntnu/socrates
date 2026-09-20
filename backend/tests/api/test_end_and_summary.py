from app.api.deps import get_service
from app.main import app
from app.services.conversation import ConversationService
from app.tutor.gateway import TutorGateway


def _create(client, learner_id):
    return client.post(
        "/api/sessions", json={"ladder_id": "trolley"}, headers={"X-Learner-Id": learner_id}
    ).json()["session"]["id"]


class CountingProvider:
    """只記錄 generate() 被呼叫幾次，不做任何真正的推論。

    /end 這條路徑上呼叫次數必須是 0——用來證明 end() 真的沒有接觸 provider，
    不是只看回應裡的 summary 欄位剛好是 None。
    """

    def __init__(self):
        self.call_count = 0

    def generate(self, request):
        self.call_count += 1
        if request.kind == "summarize":
            return {
                "core_principle": "不應該產生",
                "tension": "",
                "stance_by_stage": [],
                "shifted": False,
            }
        return {
            "reply_text": "不應該產生",
            "observations": {
                "has_position": True,
                "has_reason": False,
                "reason_tested": False,
                "principle_label": "未明",
                "position_shifted": False,
            },
        }


def test_end_returns_immediately_without_summary(client, learner_id):
    """設計規格 §9.2：POST /end 立刻回傳，總結另外產生。

    接上真 LLM 後，同步版會讓學生盯著轉圈好幾秒——而那是整段體驗的最後一刻。
    """
    session_id = _create(client, learner_id)
    response = client.post(f"/api/sessions/{session_id}/end", headers={"X-Learner-Id": learner_id})
    assert response.status_code == 200
    body = response.json()
    assert body["session"]["status"] == "ended"
    assert body["available_actions"] == []
    assert body["summary"] is None


def test_end_makes_no_provider_calls(client, learner_id, db):
    """設計規格 §9.2 補強：不是只有「回應要立刻出現」，是 /end 這條路徑上
    完全不准碰 provider——接上真 LLM 之後，即使討論結果看起來一樣，使用者
    一樣要多等好幾秒、系統一樣要多付一次不會被用到的 API 費用。

    只斷言回應的 summary 欄位是 None 抓不到這個問題：就算 end() 內部真的
    呼叫了 provider 並把結果丟掉，那個斷言一樣會過。這裡改成直接數
    provider.generate() 被呼叫幾次，發言（先前）與 end() 用的是不同的
    service override，所以 0 是對整個 CountingProvider 生命週期而言的真值，
    不是相減出來的。
    """
    import app.main as main

    session_id = _create(client, learner_id)
    message = client.post(
        f"/api/sessions/{session_id}/messages",
        json={"text": "我會轉向，因為救下的人比較多"},
        headers={"X-Learner-Id": learner_id},
    )
    assert message.status_code == 200

    provider = CountingProvider()
    app.dependency_overrides[get_service] = lambda: ConversationService(
        db, main.ladder_repository, TutorGateway(provider)
    )
    try:
        response = client.post(
            f"/api/sessions/{session_id}/end", headers={"X-Learner-Id": learner_id}
        )
        assert response.status_code == 200
        assert provider.call_count == 0
    finally:
        app.dependency_overrides.pop(get_service, None)


def test_summary_is_generated_then_readable(client, learner_id):
    session_id = _create(client, learner_id)
    client.post(
        f"/api/sessions/{session_id}/messages",
        json={"text": "我會轉向，因為救下的人比較多"},
        headers={"X-Learner-Id": learner_id},
    )
    client.post(f"/api/sessions/{session_id}/end", headers={"X-Learner-Id": learner_id})

    created = client.post(
        f"/api/sessions/{session_id}/summary", headers={"X-Learner-Id": learner_id}
    )
    assert created.status_code == 201
    assert created.json()["core_principle"]

    read = client.get(f"/api/sessions/{session_id}/summary", headers={"X-Learner-Id": learner_id})
    assert read.status_code == 200
    assert read.json()["core_principle"] == created.json()["core_principle"]


def test_end_without_student_message_uses_neutral_text(client, learner_id):
    """沒有發言就沒有可推論的原則；不得套用腳本的固定立場。"""
    session_id = _create(client, learner_id)
    client.post(f"/api/sessions/{session_id}/end", headers={"X-Learner-Id": learner_id})
    response = client.post(
        f"/api/sessions/{session_id}/summary", headers={"X-Learner-Id": learner_id}
    )
    assert response.status_code == 201
    assert response.json()["core_principle"] == "尚未提出立場"


def test_active_session_cannot_generate_summary(client, learner_id):
    session_id = _create(client, learner_id)
    response = client.post(
        f"/api/sessions/{session_id}/summary", headers={"X-Learner-Id": learner_id}
    )
    assert response.status_code == 409


def test_wrap_up_cap_ends_as_completed(client, learner_id, monkeypatch):
    """單階案例第三輪達成；再講三輪達到 ladder 的追加上限。"""
    import app.main as main
    from app.ladders.repository import LadderRepository

    ladder = main.ladder_repository.get()
    monkeypatch.setattr(
        main,
        "ladder_repository",
        LadderRepository(ladder.model_copy(update={"stages": [ladder.stages[0]]})),
    )
    session_id = _create(client, learner_id)
    for _ in range(5):
        response = client.post(
            f"/api/sessions/{session_id}/messages",
            json={"text": "我的想法"},
            headers={"X-Learner-Id": learner_id},
        )
        assert response.status_code == 200
    before_cap = client.get(f"/api/sessions/{session_id}", headers={"X-Learner-Id": learner_id})
    assert before_cap.json()["session"]["status"] == "active"

    final_turn = client.post(
        f"/api/sessions/{session_id}/messages",
        json={"text": "最後補充"},
        headers={"X-Learner-Id": learner_id},
    )
    assert final_turn.status_code == 200
    detail = client.get(f"/api/sessions/{session_id}", headers={"X-Learner-Id": learner_id})
    assert detail.json()["session"]["status"] == "ended"
    assert detail.json()["session"]["end_reason"] == "completed"


def test_summary_generation_is_idempotent(client, learner_id):
    """失敗可重試：可重複呼叫，成功才寫入。
    不能讓一次 LLM 失敗就讓整段對話白跑。"""
    session_id = _create(client, learner_id)
    client.post(f"/api/sessions/{session_id}/end", headers={"X-Learner-Id": learner_id})
    first = client.post(
        f"/api/sessions/{session_id}/summary", headers={"X-Learner-Id": learner_id}
    ).json()
    second = client.post(
        f"/api/sessions/{session_id}/summary", headers={"X-Learner-Id": learner_id}
    ).json()
    assert first["core_principle"] == second["core_principle"]


def test_summary_hides_titles_of_stages_never_reached(client, learner_id, two_stage_app):
    """已結束也不能洩漏沒走到的階叫什麼——否則學生下一次就有預期了，
    §4.1 的不劇透規則會跨 session 失效。"""
    session_id = _create(client, learner_id)
    client.post(f"/api/sessions/{session_id}/end", headers={"X-Learner-Id": learner_id})
    client.post(f"/api/sessions/{session_id}/summary", headers={"X-Learner-Id": learner_id})

    read = client.get(f"/api/sessions/{session_id}/summary", headers={"X-Learner-Id": learner_id})
    outcomes = read.json()["stage_outcomes"]
    skipped = [o for o in outcomes if o["status"] == "skipped"]
    assert skipped
    assert all(o["title"] is None for o in skipped)


def test_ended_session_rejects_further_messages(client, learner_id):
    session_id = _create(client, learner_id)
    client.post(f"/api/sessions/{session_id}/end", headers={"X-Learner-Id": learner_id})
    response = client.post(
        f"/api/sessions/{session_id}/messages",
        json={"text": "還想再說"},
        headers={"X-Learner-Id": learner_id},
    )
    assert response.status_code == 409
