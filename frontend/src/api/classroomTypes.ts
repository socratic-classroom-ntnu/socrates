// Generated from FastAPI /api/v2. Regenerate with scripts/gen_classroom_types.py.
export interface components { schemas: {
  "AccountView": { "id": string; "username": string; "email": string; "email_masked": string; "verified": boolean; "authority_state": "EMAIL_VERIFICATION" | "FULL_PRODUCT"; "verification_delivery"?: (components["schemas"]["VerificationDelivery"] | null); "csrf_token": string; "points": number; "achievements": Array<string> };
  "AddAIStudents": { "action_id": string; "count": number; "model": string; "provider_profile_id"?: (string | null) };
  "AttachScript": { "action_id": string; "script_id"?: (string | null); "document"?: (Record<string, unknown> | null) };
  "ClearAIStudents": { "action_id": string };
  "Command": { "action_id": string; "kind": "start" | "draft" | "answer" | "barrage" | "focus_message" | "next" | "approve_question" | "regenerate_question" | "personal_summary"; "data"?: Record<string, unknown> };
  "Configure": { "action_id": string; "expected_roster_digest": string; "group_count": number; "members_per_group": number; "assignments"?: Record<string, number>; "avatar_pack_id": string };
  "CreateBatch": { "action_id": string; "script_id": string };
  "CreateClassroom": { "action_id": string; "title": string };
  "CreateProfile": { "name": string; "adapter": string; "base_url"?: (string | null); "organization"?: (string | null); "project"?: (string | null); "default_model": string; "credential_mode": "PERSISTENT" | "SESSION"; "credential"?: (string | null) };
  "CreateRoom": { "script_id": string };
  "CredentialUpdate": { "credential": string; "credential_mode": "PERSISTENT" | "SESSION" };
  "GroupCommand": { "action_id": string; "kind": string; "data"?: Record<string, unknown> };
  "HTTPValidationError": { "detail"?: Array<components["schemas"]["ValidationError"]> };
  "JoinRoom": { "code": string; "alias": string; "avatar": string };
  "Login": { "login": string; "password": string };
  "MailRequest": { "email": string };
  "MemberView": { "id": string; "alias": string; "avatar": string; "seat": number; "online": boolean; "points": number; "achievements": Array<string>; "username"?: (string | null); "actor_type": "human" | "llm_student"; "persona_id"?: (string | null) };
  "Option": { "id": string; "text": string };
  "OtherSuggestionRequest": { "question_id": string; "title": string; "scenario": string; "existing_options"?: Array<string>; "room_id"?: (string | null) };
  "Question": { "id": string; "title": string; "scenario": string; "options": Array<components["schemas"]["Option"]>; "duration_seconds": number; "argument_required": boolean; "tutor_goal": string; "probe_hints"?: Array<string>; "max_focus_turns": number; "focus_response_seconds": number; "sender_point_cap": number; "receiver_point_cap": number };
  "Reaction": { "action_id": string; "kind": "heart" | "like" | "gift"; "focus_id": string; "turn_index": number };
  "Register": { "username": string; "email": string; "password": string };
  "ResetRequest": { "token": string; "password": string };
  "RoomSummary": { "id": string; "title": string; "phase": string; "teacher": boolean };
  "RoomView": { "id": string; "code": (string | null); "title": string; "role": "teacher" | "student"; "member_id": (string | null); "phase": string; "seq": number; "server_now": number; "deadline_at": (number | null); "question": (components["schemas"]["Question"] | null); "question_index": number; "question_run_id": (string | null); "question_count": number; "members": Array<components["schemas"]["MemberView"]>; "my_draft": (Record<string, unknown> | null); "my_answer": (Record<string, unknown> | null); "distribution": Array<Record<string, unknown>>; "focus": (Record<string, unknown> | null); "transcript": Array<Record<string, unknown>>; "preview": (components["schemas"]["Question"] | null); "summaries": Record<string, unknown>; "available_actions": Array<string>; "source_mode": string; "last_error": (string | null) };
  "ScriptDocument": { "title": string; "mode": "static" | "dynamic"; "questions": Array<components["schemas"]["Question"]>; "max_questions": number; "preview_seconds": number; "live_llm_call_budget": number };
  "ScriptSave": { "document": components["schemas"]["ScriptDocument"]; "expected_revision"?: (number | null) };
  "SettingsUpdate": { "default_profile_id"?: (string | null); "fallback_profile_id"?: (string | null); "model_matrix"?: Record<string, string>; "budgets"?: Record<string, unknown>; "active_room_id"?: (string | null) };
  "Start": { "action_id": string; "expected_roster_digest": string; "accept_temporary_aliases": boolean };
  "TokenRequest": { "token": string };
  "UpdateProfile": { "name"?: (string | null); "base_url"?: (string | null); "organization"?: (string | null); "project"?: (string | null); "default_model"?: (string | null); "enabled"?: (boolean | null) };
  "ValidationError": { "loc": Array<(string | number)>; "msg": string; "type": string };
  "VerificationDelivery": { "mail_id": string; "delivery_state": string; "expires_at": number };
} }
