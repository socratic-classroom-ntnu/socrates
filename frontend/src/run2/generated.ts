// Generated from FastAPI /api/v2. Regenerate with scripts/gen_run2_types.py.
export interface components { schemas: {
  "AccountView": { "id": string; "username": string; "email": string; "verified": boolean; "csrf_token": string; "points": number; "achievements": Array<string> };
  "Command": { "action_id": string; "kind": "start" | "draft" | "answer" | "barrage" | "focus_message" | "next" | "approve_question" | "regenerate_question" | "personal_summary"; "data"?: Record<string, unknown> };
  "CreateRoom": { "script_id": string };
  "HTTPValidationError": { "detail"?: Array<components["schemas"]["ValidationError"]> };
  "JoinRoom": { "code": string; "alias": string; "avatar": string };
  "Login": { "login": string; "password": string };
  "MailRequest": { "email": string };
  "MemberView": { "id": string; "alias": string; "avatar": string; "seat": number; "online": boolean; "points": number; "achievements": Array<string>; "username"?: (string | null) };
  "Option": { "id": string; "text": string };
  "Question": { "id": string; "title": string; "scenario": string; "options": Array<components["schemas"]["Option"]>; "duration_seconds": number; "argument_required": boolean; "tutor_goal": string; "probe_hints"?: Array<string>; "max_focus_turns": number; "focus_response_seconds": number; "sender_point_cap": number; "receiver_point_cap": number };
  "Reaction": { "action_id": string; "kind": "heart" | "like" | "gift"; "focus_id": string; "turn_index": number };
  "Register": { "username": string; "email": string; "password": string };
  "ResetRequest": { "token": string; "password": string };
  "RoomView": { "id": string; "code": (string | null); "title": string; "role": "teacher" | "student"; "member_id": (string | null); "phase": string; "seq": number; "server_now": number; "deadline_at": (number | null); "question": (components["schemas"]["Question"] | null); "question_index": number; "question_run_id": (string | null); "question_count": number; "members": Array<components["schemas"]["MemberView"]>; "my_draft": (Record<string, unknown> | null); "my_answer": (Record<string, unknown> | null); "distribution": Array<Record<string, unknown>>; "focus": (Record<string, unknown> | null); "transcript": Array<Record<string, unknown>>; "preview": (components["schemas"]["Question"] | null); "summaries": Record<string, unknown>; "available_actions": Array<string>; "source_mode": string; "last_error": (string | null) };
  "ScriptDocument": { "title": string; "mode": "static" | "dynamic"; "questions": Array<components["schemas"]["Question"]>; "max_questions": number; "preview_seconds": number; "live_llm_call_budget": number };
  "ScriptSave": { "document": components["schemas"]["ScriptDocument"]; "expected_revision"?: (number | null) };
  "TokenRequest": { "token": string };
  "ValidationError": { "loc": Array<(string | number)>; "msg": string; "type": string; "input"?: unknown; "ctx"?: Record<string, unknown> };
} }
