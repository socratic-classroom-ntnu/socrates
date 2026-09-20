def _create(client, learner_id):
    return client.post(
        "/api/sessions", json={"ladder_id": "trolley"}, headers={"X-Learner-Id": learner_id}
    ).json()["session"]["id"]


def test_send_message_appends_student_and_tutor(client, learner_id):
    session_id = _create(client, learner_id)
    response = client.post(
        f"/api/sessions/{session_id}/messages",
        json={"text": "我會轉向，因為五條命比一條多"},
        headers={"X-Learner-Id": learner_id},
    )
    assert response.status_code == 200
    body = response.json()
    assert [m["role"] for m in body["appended_messages"]] == ["student", "tutor"]
    assert body["available_actions"] == ["send_message", "end"]


def test_blank_message_is_rejected(client, learner_id):
    session_id = _create(client, learner_id)
    response = client.post(
        f"/api/sessions/{session_id}/messages",
        json={"text": "   "},
        headers={"X-Learner-Id": learner_id},
    )
    assert response.status_code == 422


def test_overlong_message_is_rejected(client, learner_id):
    session_id = _create(client, learner_id)
    response = client.post(
        f"/api/sessions/{session_id}/messages",
        json={"text": "字" * 2001},
        headers={"X-Learner-Id": learner_id},
    )
    assert response.status_code == 422


def test_cannot_send_while_previous_message_awaits_reply(client, learner_id, exploding_service):
    """待回覆時再送一則必須被拒絕，否則會有兩則學生發言共用一輪。"""
    session_id = _create(client, learner_id)
    first = client.post(
        f"/api/sessions/{session_id}/messages",
        json={"text": "第一段思考"},
        headers={"X-Learner-Id": learner_id},
    )
    assert first.status_code == 503

    second = client.post(
        f"/api/sessions/{session_id}/messages",
        json={"text": "再送一次"},
        headers={"X-Learner-Id": learner_id},
    )
    assert second.status_code == 409


def test_retry_is_rejected_once_the_turn_already_has_a_reply(client, learner_id):
    """成功之後重複 retry 必須被拒絕，不得重跑已完成的一輪。"""
    session_id = _create(client, learner_id)
    client.post(
        f"/api/sessions/{session_id}/messages",
        json={"text": "我會轉向"},
        headers={"X-Learner-Id": learner_id},
    )
    response = client.post(
        f"/api/sessions/{session_id}/retry", headers={"X-Learner-Id": learner_id}
    )
    assert response.status_code == 409


def _hijack_lock(monkeypatch, inject):
    """讓第一次取得列鎖時，先模擬「對手請求已經寫入」的狀態。

    這是 `_run_turn` 的 `expected_student_seq` 分支唯一會走到的情境。
    用注入取代真的開執行緒：結果確定、不會偶發，而這段邏輯正是整份計畫裡
    最容易寫錯的地方，不能只靠人眼 review。
    """
    from app.domain.session_state import OutgoingMessage
    from app.services import conversation

    original = conversation.ConversationService._lock
    fired = {"done": False}

    def patched(self, session_id, learner_id):
        session = original(self, session_id, learner_id)
        if not fired["done"] and session.messages and session.messages[-1].role == "student":
            fired["done"] = True
            self._repo.append_messages(session, inject(OutgoingMessage))
            self._db.flush()
        return session

    monkeypatch.setattr(conversation.ConversationService, "_lock", patched)


def test_send_returns_the_existing_turn_when_a_rival_retry_already_finished_it(
    client, learner_id, monkeypatch
):
    """對手的 retry 搶先寫完這一輪時，send 必須回傳既有結果，
    **不得再呼叫一次 provider 產生第二則教授回覆**。"""
    session_id = _create(client, learner_id)
    _hijack_lock(
        monkeypatch,
        lambda M: (M(role="tutor", content="對手 retry 產生的回覆", stage_index=0),),
    )

    response = client.post(
        f"/api/sessions/{session_id}/messages",
        json={"text": "我會轉向"},
        headers={"X-Learner-Id": learner_id},
    )
    assert response.status_code == 200
    assert [m["role"] for m in response.json()["appended_messages"]] == ["student", "tutor"]

    detail = client.get(f"/api/sessions/{session_id}", headers={"X-Learner-Id": learner_id})
    roles = [m["role"] for m in detail.json()["messages"]]
    assert roles == ["tutor", "student", "tutor"]  # 開場、學生、對手那一則。沒有第四則


def test_send_refuses_when_the_conversation_has_moved_on(client, learner_id, monkeypatch):
    """對話已經走到下一輪時，原本那個 send 不得拿別人的學生發言去呼叫 provider。"""
    session_id = _create(client, learner_id)
    _hijack_lock(
        monkeypatch,
        lambda M: (
            M(role="tutor", content="對手的回覆", stage_index=0),
            M(role="student", content="對手的下一則發言", stage_index=0),
        ),
    )

    response = client.post(
        f"/api/sessions/{session_id}/messages",
        json={"text": "我會轉向"},
        headers={"X-Learner-Id": learner_id},
    )
    assert response.status_code == 409


def test_retry_is_rejected_after_hitting_the_cap(client, learner_id, exploding_service):
    """設計規格 §10：retry 有次數上限，避免無限重打失敗的 API。

    provider 持續失敗時，前三次 retry 各自遞增 retry_count 並回 503
    （學生訊息與計數都保留）；第四次在還沒呼叫 provider 前就被擋下，回 409。
    """
    session_id = _create(client, learner_id)
    first = client.post(
        f"/api/sessions/{session_id}/messages",
        json={"text": "我會轉向"},
        headers={"X-Learner-Id": learner_id},
    )
    assert first.status_code == 503

    for _ in range(3):
        retried = client.post(
            f"/api/sessions/{session_id}/retry", headers={"X-Learner-Id": learner_id}
        )
        assert retried.status_code == 503

    capped = client.post(f"/api/sessions/{session_id}/retry", headers={"X-Learner-Id": learner_id})
    assert capped.status_code == 409

    detail = client.get(f"/api/sessions/{session_id}", headers={"X-Learner-Id": learner_id})
    contents = [m["content"] for m in detail.json()["messages"]]
    assert "我會轉向" in contents  # 學生的發言全程沒有因為重試次數用完而消失


def test_session_message_cap_is_the_last_safety_net(client, learner_id, monkeypatch):
    """設計規格 §10：每個 session 設訊息總數上限當最後的安全網。

    擋的不是正常使用，是失控的迴圈與濫用。
    """
    from app.services import conversation

    monkeypatch.setattr(conversation, "MAX_MESSAGES_PER_SESSION", 4)
    session_id = _create(client, learner_id)
    for _ in range(2):
        client.post(
            f"/api/sessions/{session_id}/messages",
            json={"text": "再說一點"},
            headers={"X-Learner-Id": learner_id},
        )
    response = client.post(
        f"/api/sessions/{session_id}/messages",
        json={"text": "還要再說"},
        headers={"X-Learner-Id": learner_id},
    )
    assert response.status_code == 409


def _interleave_after_turn_commit(db, monkeypatch, rival_action):
    """Run a rival request after the turn commits and its row lock is released."""
    original_commit = db.commit
    calls = 0
    fired = False

    def commit_with_rival():
        nonlocal calls, fired
        original_commit()
        calls += 1
        # The first commit stores the student's message; the second stores the tutor turn.
        if calls == 2 and not fired:
            fired = True
            rival_action()

    monkeypatch.setattr(db, "commit", commit_with_rival)


def test_send_response_is_snapshot_before_rival_end(client, db, learner_id, monkeypatch):
    """A later end must not mix ended status with the previous turn's actions."""
    import uuid

    from app.api.deps import get_service

    session_id = _create(client, learner_id)
    _interleave_after_turn_commit(
        db,
        monkeypatch,
        lambda: get_service(db).end(uuid.UUID(session_id), uuid.UUID(learner_id)),
    )

    response = client.post(
        f"/api/sessions/{session_id}/messages",
        json={"text": "第一個想法"},
        headers={"X-Learner-Id": learner_id},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["session"]["status"] == "active"
    assert body["session"]["flow_state"] == "active_in_stage"
    assert body["available_actions"] == ["send_message", "end"]
    assert [m["content"] for m in body["appended_messages"]] == [
        "第一個想法",
        "所以你會把電車轉向。為什麼？",
    ]
    detail = client.get(f"/api/sessions/{session_id}", headers={"X-Learner-Id": learner_id})
    assert detail.json()["session"]["status"] == "ended"


def test_send_response_does_not_return_rival_messages(client, db, learner_id, monkeypatch):
    """A later send must not replace the first POST's appended messages."""
    import uuid

    from app.api.deps import get_service

    session_id = _create(client, learner_id)
    _interleave_after_turn_commit(
        db,
        monkeypatch,
        lambda: get_service(db).send_message(
            uuid.UUID(session_id), uuid.UUID(learner_id), "第二個想法"
        ),
    )

    response = client.post(
        f"/api/sessions/{session_id}/messages",
        json={"text": "第一個想法"},
        headers={"X-Learner-Id": learner_id},
    )
    assert response.status_code == 200
    assert [m["content"] for m in response.json()["appended_messages"]] == [
        "第一個想法",
        "所以你會把電車轉向。為什麼？",
    ]
    detail = client.get(f"/api/sessions/{session_id}", headers={"X-Learner-Id": learner_id})
    assert [m["content"] for m in detail.json()["messages"]][-2:] == [
        "第二個想法",
        "一條命換五條命——你用的是數量。那如果岔道上站的是一百個人，而直行只會撞到一個人呢？",
    ]
