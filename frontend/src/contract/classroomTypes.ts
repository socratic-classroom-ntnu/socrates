// Generated from FastAPI /api/v2. Regenerate with scripts/gen_classroom_types.py.
export interface components { schemas: {
  "AISettingsView": { "default_profile_id": (string | null); "fallback_profile_id": (string | null); "model_matrix": Record<string, string>; "budgets": Record<string, unknown>; "revision": number };
  "AIStudentCreatedView": { "account_id": string; "membership_id": string; "alias": string; "persona_id": string; "model": string; "provider_profile_id"?: (string | null) };
  "AccountView": { "id": string; "username": string; "email": string; "email_masked": string; "verified": boolean; "authority_state": "EMAIL_VERIFICATION" | "FULL_PRODUCT"; "verification_delivery"?: (components["schemas"]["VerificationDelivery"] | null); "csrf_token": string; "points": number; "achievements": Array<string>; "locale"?: ("zh-Hant" | "zh-Hans" | "en" | "es" | null); "kind": "guest" | "expired_guest" | "registered"; "guest_expires_at"?: (number | null) };
  "ActivityDetailsUpdate": { "title"?: (string | null); "ends_at"?: (number | null) };
  "ActivityDraft": { "title": string; "starts_at"?: (number | null); "ends_at": number };
  "ActivityJoin": { "display_name": string };
  "ActivityJoinPreview": { "activity_id": string; "title": string; "course_id": string; "course_name": string; "teacher_name": string; "starts_at": number; "ends_at": number; "status": "scheduled" | "open" | "ended"; "already_enrolled": boolean; "default_display_name": string };
  "ActivityJoinResult": { "course_id": string; "activity_id": string; "enrolled_now": boolean };
  "ActivityStudentCard": { "id": string; "title": string; "status": "scheduled" | "open" | "ended"; "starts_at": number; "ends_at": number };
  "ActivityStudentList": { "role": "student"; "items": Array<components["schemas"]["ActivityStudentCard"]> };
  "ActivityTeacherCard": { "id": string; "title": string; "status": "draft" | "scheduled" | "open" | "ended"; "locked": boolean; "has_unpublished_changes": boolean; "starts_at": (number | null); "ends_at": (number | null); "available_actions": Array<"update" | "update_details" | "publish" | "start_now" | "end_now" | "copy" | "delete"> };
  "ActivityTeacherList": { "role": "teacher"; "items": Array<components["schemas"]["ActivityTeacherCard"]> };
  "ActivityTeacherView": { "id": string; "course_id": string; "status": "draft" | "scheduled" | "open" | "ended"; "locked": boolean; "has_unpublished_changes": boolean; "revision": (number | null); "draft": components["schemas"]["ActivityDraft"]; "starts_at": (number | null); "ends_at": (number | null); "available_actions": Array<"update" | "update_details" | "publish" | "start_now" | "end_now" | "copy" | "delete"> };
  "AddAIStudents": { "action_id": string; "count": number; "model": string; "provider_profile_id"?: (string | null) };
  "AddAIStudentsReceipt": { "status": string; "action_id": string; "seq": number; "room_id": string; "created": Array<components["schemas"]["AIStudentCreatedView"]>; "roster_digest": string };
  "AnalysisEdgeView": { "source": string; "target": string; "type": "supports" | "challenges" | "qualifies" | "revises"; "provenance": "student_selected_relation" | "confirmation_snapshot" };
  "AnalysisGroupView": { "id": string; "label": string; "phase": string; "snapshot_id": string; "settlement": components["schemas"]["SettlementView"]; "persons": Array<components["schemas"]["AnalysisPersonView"]>; "nodes": Array<components["schemas"]["AnalysisNodeView"]>; "edges": Array<components["schemas"]["AnalysisEdgeView"]>; "tree_projection": Array<components["schemas"]["AnalysisTreeNodeView"]>; "roots": Array<string>; "stances": Array<components["schemas"]["GroupStanceView"]> };
  "AnalysisNodeView": { "id": string; "person_id": string; "nickname": string; "text": string; "at": number; "sequence": number; "stage": string; "question_index": number; "kind": "statement" | "post_ack_observation" | "confirmed_viewpoint"; "provenance": "student_original_quote" | "student_explicit_confirmation"; "visibility"?: ("personal" | "stage" | "group_shared" | null); "summary_digest"?: (string | null) };
  "AnalysisPersonView": { "id": string; "nickname": string; "confirmed": boolean; "confirmation_digest": (string | null); "timeline": Array<components["schemas"]["AnalysisNodeView"]> };
  "AnalysisTreeNodeView": { "id": string; "parent": (string | null); "cross_references": Array<components["schemas"]["AnalysisEdgeView"]> };
  "AttachScript": { "action_id": string; "script_id"?: (string | null); "document"?: (Record<string, unknown> | null) };
  "AttachedScriptView": { "id": string; "revision": number; "document": Record<string, unknown>; "classroom_id": string };
  "BankImportResult": { "id": string; "revision": number; "question_id": string; "document": components["schemas"]["ScriptDocument"] };
  "BankMutation": { "action_id": string };
  "BankQuestionDetail": { "id": string; "title": string; "tags": Array<string>; "scenario_excerpt": string; "option_count": number; "author": (string | null); "mine": boolean; "published_at": number; "revision": number; "source_script_id"?: (string | null); "source_question_id"?: (string | null); "question": components["schemas"]["Question"] };
  "BankQuestionSummary": { "id": string; "title": string; "tags": Array<string>; "scenario_excerpt": string; "option_count": number; "author": (string | null); "mine": boolean; "published_at": number; "revision": number; "source_script_id"?: (string | null); "source_question_id"?: (string | null) };
  "BankSearchResult": { "items": Array<components["schemas"]["BankQuestionSummary"]>; "total": number; "offset": number; "limit": number };
  "BankUnpublishResult": { "id": string; "status": string };
  "ChartSemanticsView": { "sunburst": string; "sankey": string; "graph": string; "heatmap": string; "timeline": string };
  "CitationSourceView": { /** ID of the student message whose exact text contains quote. */ "message_id": string; /** Exact, unnormalised substring of the referenced SoloMessageView.text. */ "quote": string; /** Zero-based inclusive offset in UTF-16 code units to quote's first exact occurrence in SoloMessageView.text. */ "start": number; /** Zero-based exclusive offset in UTF-16 code units into SoloMessageView.text; text.slice(start, end) equals quote. */ "end": number };
  "ClassroomAISettingsView": { "default_profile_id"?: (string | null); "fallback_profile_id"?: (string | null); "model_matrix"?: Record<string, string>; "scenario_overrides"?: Record<string, unknown>; "budgets"?: Record<string, unknown>; "revision": number };
  "ClassroomActionReceipt": { "status": string; "action_id": string; "seq": number; "room_id"?: (string | null) };
  "ClassroomBatchView": { "id": string; "classroom_id": string; "batch_id": string; "code": (string | null) };
  "ClassroomEventPage": { "events": Array<components["schemas"]["ClassroomEventView"]>; "latest_seq": number; "more": boolean };
  "ClassroomEventView": { "seq": number; "type": string; "payload": Record<string, unknown> };
  "ClearAIStudents": { "action_id": string };
  "ClearAIStudentsReceipt": { "status": string; "action_id": string; "seq": number; "room_id": string; "removed": number; "roster_digest": string };
  "Command": { "action_id": string; "kind": "start" | "draft" | "answer" | "barrage" | "focus_message" | "next" | "end" | "approve_question" | "regenerate_question" | "personal_summary"; "data"?: Record<string, unknown> };
  "Configure": { "action_id": string; "expected_roster_digest": string; "group_count": number; "members_per_group": number; "assignments"?: Record<string, number>; "avatar_pack_id": string };
  "ConfirmViewpointBody": { "summary_digest": string };
  "ConnectionTestView": { "status": "READY"; "provider_profile_id": string; "adapter": "openrouter" | "openai" | "anthropic" | "gemini" | "openai-compatible"; "model_count": number; "sample": Array<components["schemas"]["DiscoveredModel"]>; "observed_at": number };
  "CourseCreate": { "name": string; "teacher_name": string; "intro": string; "goals": string };
  "CourseJoin": { "code": string; "display_name": string };
  "CourseLearningCard": { "id": string; "name": string; "teacher_name": string; "open_activity_count": number; "highlight": (components["schemas"]["ActivityStudentCard"] | null) };
  "CourseLists": { "teaching": Array<components["schemas"]["CourseTeachingCard"]>; "learning": Array<components["schemas"]["CourseLearningCard"]> };
  "CourseStudentView": { "role": "student"; "id": string; "name": string; "teacher_name": string; "intro": string; "code": (string | null); "display_name": string };
  "CourseTeacherView": { "role": "teacher"; "id": string; "name": string; "teacher_name": string; "intro": string; "goals": string; "code": string; "code_enabled": boolean; "student_count": number; "activity_count": number; "available_actions": Array<"update" | "rotate_code" | "disable_code" | "enable_code" | "create_activity"> };
  "CourseTeachingCard": { "id": string; "name": string; "teacher_name": string; "code": string; "code_enabled": boolean; "student_count": number; "activity_count": number; "open_activity_count": number };
  "CourseUpdate": { "name"?: (string | null); "teacher_name"?: (string | null); "intro"?: (string | null); "goals"?: (string | null) };
  "CreateBatch": { "action_id": string; "script_id": string };
  "CreateClassroom": { "action_id": string; "title": string };
  "CreateProfile": { "name": string; "adapter": string; "base_url"?: (string | null); "organization"?: (string | null); "project"?: (string | null); "default_model": string; "credential_mode": "PERSISTENT" | "SESSION"; "credential"?: (string | null) };
  "CreateRoom": { "script_id": string };
  "CredentialUpdate": { "credential": string; "credential_mode": "PERSISTENT" | "SESSION" };
  "DemoAccountView": { "username": string; "role": "teacher" | "student" };
  "DemoLoginView": { "password": string; "accounts": Array<components["schemas"]["DemoAccountView"]> };
  "DiscoveredModel": { "id": string; "name": (string | null); "pricing"?: unknown; "supported_parameters": Array<string>; "structured_outputs": (boolean | null); "reasoning": (Record<string, unknown> | null) };
  "GroupActionReceipt": { "status": string; "action_id": string; "seq": number; "room_id"?: (string | null) };
  "GroupAnalysisView": { "schema": "socrates/group-analysis/v1"; "classroom_id": string; "title": string; "groups": Array<components["schemas"]["AnalysisGroupView"]>; "basis": "attributed_original_quotes"; "identity": "nickname_and_classroom_scoped_pseudonym"; "chart_semantics": components["schemas"]["ChartSemanticsView"] };
  "GroupCollectionView": { "kind": "GroupCollection"; "id": string; "role": "teacher" | "student"; "route"?: (Record<string, string> | null); "title"?: (string | null); "phase"?: (string | null); "code"?: (string | null); "asset_classroom_id"?: (string | null); "ai_settings"?: (components["schemas"]["ClassroomAISettingsView"] | null); "features"?: (Record<string, unknown> | null); "roster"?: Array<Record<string, unknown>>; "roster_digest"?: (string | null); "configuration"?: (Record<string, unknown> | null); "groups"?: Array<Record<string, unknown>>; "available_actions"?: Array<string>; "unavailable_actions"?: Record<string, string> };
  "GroupCommand": { "action_id": string; "kind": string; "data"?: Record<string, unknown> };
  "GroupMemberIdentityView": { "username": string; "scope": "teacher_hover_only" };
  "GroupMetaView": { "id": string; "number": number; "label": string };
  "GroupRunView": { "kind": "GroupRun"; "id": string; "role": "teacher" | "student"; "seq": number; "title": string; "phase": string; "deadline_at": (number | null); "member_id": (string | null); "members": Array<Record<string, unknown>>; "runtime_mode": string; "session_batch_id": string; "group_label": string; "classroom_id": string; "question": (components["schemas"]["PublicQuestion"] | null); "transcript": Array<Record<string, unknown>>; "arguments": Array<Record<string, unknown>>; "edges": Array<Record<string, unknown>>; "settlement": Record<string, unknown>; "confirmed_members": Array<string>; "my_summary": (Record<string, unknown> | null); "avatar_pack_id": string; "source_mode": string; "focus_notice"?: unknown; "personal"?: (Record<string, unknown> | null); "available_actions"?: Array<string>; "unavailable_actions"?: Record<string, string>; "personal_progress"?: (Record<string, unknown> | null); "personal_overview"?: (Array<Record<string, unknown>> | null) };
  "GroupStanceView": { "question_index": number; "question_id": string; "question_title": string; "run_id": string; "run_phase": string; "basis": "personal_baseline"; "members": number; "confirmed": number; "unconfirmed": number; "unconfirmed_by_status": Record<string, number>; "options": Array<components["schemas"]["StanceOptionView"]>; "differing": boolean };
  "GroupStartReceipt": { "status": string; "action_id": string; "seq": number; "room_id"?: (string | null); "groups": Array<components["schemas"]["GroupMetaView"]>; "snapshot_id": string };
  "GuestJoin": { "nickname": string; "locale": "zh-Hant" | "zh-Hans" | "en" | "es" };
  "GuestUpgrade": { "username": string; "email": string; "password": string };
  "HTTPValidationError": { "detail"?: Array<components["schemas"]["ValidationError"]> };
  "ImportQuestion": { "action_id": string; "script_id": string };
  "JoinPreview": { "course_id": string; "name": string; "teacher_name": string; "already_enrolled": boolean; "default_display_name": string; "open_activity_title": (string | null) };
  "JoinRoom": { "code": string; "alias": string; "avatar": string };
  "LegacyGroupView": { "kind": "Legacy"; "id": string };
  "LibraryClassroomDetailView": { "id": string; "title": string; "revision": number; "assets": Record<string, unknown>; "scripts": Array<Record<string, unknown>>; "sessions": Array<Record<string, unknown>>; "lessons": Array<Record<string, unknown>> };
  "LibraryClassroomView": { "id": string; "title": string; "revision": number };
  "LocaleUpdate": { "locale": "zh-Hant" | "zh-Hans" | "en" | "es" };
  "Login": { "login": string; "password": string };
  "MailRequest": { "email": string };
  "MailRequestView": { "status": "REQUEST_RECORDED"; "message": string };
  "MemberView": { "id": string; "alias": string; "avatar": string; "seat": number; "online": boolean; "points": number; "achievements": Array<string>; "username"?: (string | null); "actor_type": "human" | "llm_student"; "persona_id"?: (string | null) };
  "ModelDiscoveryView": { "provider_profile_id": string; "adapter": "openrouter" | "openai" | "anthropic" | "gemini" | "openai-compatible"; "models": Array<components["schemas"]["DiscoveredModel"]>; "manual_model_id_allowed": boolean; "observed_at": number };
  "Option": { "id": string; "text": string };
  "OtherSuggestionRequest": { "question_id": string; "title": string; "scenario": string; "existing_options"?: Array<string>; "room_id"?: (string | null) };
  "OtherSuggestionView": { "suggestion_text": string; "suggestion_id": string; "suggestion_model"?: (string | null); "suggestion_provider": string; "provider_profile_id"?: (string | null); "classroom_owner_id"?: (string | null) };
  "PasswordResetView": { "status": "PASSWORD_RESET" };
  "PersonalSummaryView": { "current_position": string; "reason_summary": string; "relevant_conditions": Array<string>; "unresolved_issue": string; "principle_note": string; "sources"?: Array<components["schemas"]["CitationSourceView"]> };
  "ProfileDeletedView": { "status": "DELETED"; "profile_id": string };
  "ProfileView": { "id": string; "name": string; "adapter": "openrouter" | "openai" | "anthropic" | "gemini" | "openai-compatible"; "base_url": (string | null); "organization": (string | null); "project": (string | null); "default_model": string; "credential_mode": "PERSISTENT" | "SESSION"; "has_credential": boolean; "secret_last4": (string | null); "enabled": boolean; "metadata": Record<string, unknown>; "updated_at": number };
  "PublicConfigView": { "google_cse_id": string; "search_scope": string; "search_state": string; "debug_mode": boolean; "demo_login"?: (components["schemas"]["DemoLoginView"] | null) };
  "PublicJoinPreview": { "course_name": string };
  "PublicQuestion": { "id": string; "title": string; "scenario": string; "options": Array<components["schemas"]["Option"]>; "duration_seconds": number; "argument_required": boolean; "tutor_goal": string; "probe_hints"?: Array<string>; "max_focus_turns": number; "focus_response_seconds": number; "sender_point_cap": number; "receiver_point_cap": number; "max_personal_turns": number; "personal_seconds": number };
  "Publish": { "action_id": string; "script_id": string; "question_id": string; "title"?: (string | null); "tags"?: Array<string> };
  "Question": { "id": string; "title": string; "scenario": string; "options": Array<components["schemas"]["Option"]>; "duration_seconds": number; "argument_required": boolean; "tutor_goal": string; "probe_hints"?: Array<string>; "max_focus_turns": number; "focus_response_seconds": number; "sender_point_cap": number; "receiver_point_cap": number; "max_personal_turns": number; "personal_seconds": number; "scenario_ai"?: (components["schemas"]["ScenarioAI"] | null) };
  "Reaction": { "action_id": string; "kind": "heart" | "like" | "gift"; "focus_id": string; "turn_index": number };
  "ReadinessView": { "status": "ready"; "database": "connected"; "runtime": "classroom" };
  "Register": { "username": string; "email": string; "password": string };
  "ResendWebhookView": { "status": "RECORDED"; "matched": boolean; "provider_status"?: (string | null) };
  "ResetRequest": { "token": string; "password": string };
  "RevisionView": { "schema": "socrates/revision/v1"; "source_sha": string; "worktree_sha256": string; "environment": string; "feature_revision": number; "provider_profiles": boolean; "classroom_owner_routing": boolean; "observed_at": number };
  "RoomBudgetView": { "live_llm_call_budget": number; "used": number };
  "RoomSummary": { "id": string; "title": string; "phase": string; "teacher": boolean };
  "RoomView": { "id": string; "code": (string | null); "title": string; "role": "teacher" | "student"; "member_id": (string | null); "phase": string; "seq": number; "server_now": number; "deadline_at": (number | null); "question": (components["schemas"]["PublicQuestion"] | null); "question_index": number; "question_run_id": (string | null); "question_count": number; "members": Array<components["schemas"]["MemberView"]>; "my_draft": (Record<string, unknown> | null); "my_answer": (Record<string, unknown> | null); "distribution": Array<Record<string, unknown>>; "focus": (Record<string, unknown> | null); "transcript": Array<Record<string, unknown>>; "preview": (components["schemas"]["PublicQuestion"] | null); "summaries": Record<string, unknown>; "available_actions": Array<string>; "source_mode": string; "last_error": (string | null) };
  "SampleQuestionDraft": { "id": string; "title": string; "scenario": string; "options"?: Array<components["schemas"]["Option"]>; "duration_seconds": number; "argument_required": boolean; "tutor_goal": string; "probe_hints"?: Array<string>; "max_focus_turns": number; "focus_response_seconds": number; "sender_point_cap": number; "receiver_point_cap": number; "max_personal_turns": number; "personal_seconds": number };
  "SampleQuestionSet": { "title": string; "questions": Array<components["schemas"]["SampleQuestionDraft"]> };
  "ScenarioAI": { "provider_profile_id": string; "model": string };
  "ScriptAssistRequest": { "request": string; "document"?: Record<string, unknown>; "question_index"?: (number | null); "script_id"?: (string | null) };
  "ScriptAssistView": { "question": components["schemas"]["PublicQuestion"]; "question_index": (number | null); "rationale": string; "model": (string | null); "provider": (string | null) };
  "ScriptDocument": { "title": string; "mode": "static" | "dynamic"; "questions": Array<components["schemas"]["Question"]>; "max_questions": number; "preview_seconds": number; "live_llm_call_budget": number };
  "ScriptRevisionView": { "id": string; "revision": number };
  "ScriptSave": { "document": components["schemas"]["ScriptDocument"]; "expected_revision"?: (number | null) };
  "ScriptView": { "id": string; "revision": number; "document": Record<string, unknown> };
  "SendMessageBody": { "text": string; "revise_hint"?: ("stance" | "reason" | "condition" | "changed_mind" | null) };
  "SettingsUpdate": { "default_profile_id"?: (string | null); "fallback_profile_id"?: (string | null); "model_matrix"?: Record<string, string>; "budgets"?: Record<string, unknown>; "active_room_id"?: (string | null) };
  "SettlementView": { "state": "EXPLORING" | "CURRENT_PHASE_FINISHING" | "FINAL_STAGE" | "SETTLED"; "latched_at"?: (number | null); "latched_phase"?: (string | null); "final_stage_count"?: (number | null); "started_at"?: (number | null); "settled_at"?: (number | null); "ended_by"?: ("system" | "teacher" | null); "end_reason"?: ("final_stage_complete" | "teacher_force_end" | null); "incomplete_members"?: (Array<string> | null); "member_status"?: (Record<string, "confirmed" | "incomplete"> | null) };
  "SignedOutView": { "status": "SIGNED_OUT" };
  "SoloActivityAnalysisView": { "activity_id": string; "title": string; "course_id": string; "course_name": string; "status": "draft" | "scheduled" | "open" | "ended"; "ends_at": (number | null); "generated_at": number; "revision_id": (string | null); "summary": components["schemas"]["SoloAnalysisSummaryView"]; "students": Array<components["schemas"]["SoloAnalysisStudentView"]> };
  "SoloActivityProgressView": { "activity_id": string; "title": string; "course_id": string; "course_name": string; "status": "draft" | "scheduled" | "open" | "ended"; "ends_at": (number | null); "generated_at": number; "summary": components["schemas"]["SoloProgressSummaryView"]; "students": Array<components["schemas"]["SoloStudentProgressView"]> };
  "SoloActivityView": { "activity_id": string; "title": string; "course_id": string; "course_name": string; "status": "scheduled" | "open" | "ended"; "ends_at": number; "attempt": (components["schemas"]["SoloAttemptBrief"] | null) };
  "SoloAnalysisStudentView": { "enrollment_id": string; "display_name": string; "confirmed_scenarios": number; "current_position": string; "reason_summary": string; "relevant_conditions": Array<string> };
  "SoloAnalysisSummaryView": { "enrolled": number; "started": number; "done": number; "in_progress": number };
  "SoloAttemptBrief": { "id": string; "state": "answering" | "awaiting_tutor" | "tutor_unavailable" | "in_dialogue" | "confirming" | "between_scenarios" | "reviewing" | "awaiting_reflection_prompt" | "reflecting" | "budget_exhausted" | "completed"; "scenario_index": number; "progress": Array<components["schemas"]["SoloScenarioProgressView"]>; "review_status": "not_started" | "in_progress"; "current_turn": number };
  "SoloAttemptView": { "id": string; "activity_id": string; "activity_title": string; "course_id": string; "course_name": string; "display_name": string; "state": "answering" | "awaiting_tutor" | "tutor_unavailable" | "in_dialogue" | "confirming" | "between_scenarios" | "reviewing" | "awaiting_reflection_prompt" | "reflecting" | "budget_exhausted" | "completed"; "scenario_index": number; "scenarios": Array<components["schemas"]["SoloScenarioView"]>; "messages": Array<components["schemas"]["SoloMessageView"]>; "candidate_summary": (components["schemas"]["PersonalSummaryView"] | null); "summary_digest": (string | null); "principle_hint": ("後果主義" | "義務論" | "混合" | null); "revising": boolean; "rejected_summary": (components["schemas"]["PersonalSummaryView"] | null); "notice": ("tutor_unavailable" | "owner_provider_missing" | null); "available_actions": Array<"send_message" | "retry" | "confirm_viewpoint" | "revise_viewpoint" | "next_scenario" | "submit_review" | "retry_reflection_prompt" | "continue_reflection" | "submit_reflection" | "continue_without_tutor"> };
  "SoloMessageView": { "id": string; "scenario_index": number; "role": "student" | "tutor"; "text": string; "created_at": number; "move": ("probe" | "clarify" | "challenge" | "reflect" | "summarize" | "hypothetical" | null); "revise_hint": ("stance" | "reason" | "condition" | "changed_mind" | null) };
  "SoloProgressCellView": { "status": "answering" | "in_dialogue" | "confirming" | "confirmed"; "turns": (number | null) };
  "SoloProgressSummaryView": { "enrolled": number; "started": number; "done": number; "attention": number };
  "SoloScenarioChangeView": { "condition": string; "before": string; "after": string };
  "SoloScenarioProgressView": { "index": number; "status": "in_dialogue" | "confirmed" };
  "SoloScenarioView": { "index": number; "id": string; "text": string; "change": (components["schemas"]["SoloScenarioChangeView"] | null); "answer": (string | null); "status": "in_progress" | "goal_met"; "confirmed_summary": (components["schemas"]["PersonalSummaryView"] | null) };
  "SoloStudentProgressView": { "enrollment_id": string; "display_name": string; "overall": "not_started" | "in_progress" | "done"; "cells": Array<components["schemas"]["SoloProgressCellView"]>; "review_status": "not_started" | "in_progress"; "last_activity_at": (number | null); "attention": boolean };
  "StanceOptionView": { "option_id": string; "text": string; "count": number; "percent": number };
  "Start": { "action_id": string; "expected_roster_digest": string; "accept_temporary_aliases": boolean };
  "TokenRequest": { "token": string };
  "UpdateProfile": { "name"?: (string | null); "base_url"?: (string | null); "organization"?: (string | null); "project"?: (string | null); "default_model"?: (string | null); "enabled"?: (boolean | null) };
  "ValidationError": { "loc": Array<(string | number)>; "msg": string; "type": string };
  "VerificationDelivery": { "mail_id": string; "delivery_state": string; "expires_at": number };
  "VerificationMailView": { "status": "REQUEST_RECORDED" | "ALREADY_VERIFIED"; "message": string; "delivery"?: (components["schemas"]["VerificationDelivery"] | null) };
  "VerificationStatusDelivery": { "state": string; "provider"?: (string | null); "provider_message_id"?: (string | null); "provider_status"?: (string | null); "attempts"?: (number | null); "created_at"?: (number | null); "updated_at"?: (number | null); "sent_at"?: (number | null); "delivered_at"?: (number | null); "last_error"?: (string | null); "preview_url"?: (string | null) };
  "VerificationStatusView": { "verified": boolean; "email_masked": string; "authority_state": "EMAIL_VERIFICATION" | "FULL_PRODUCT"; "delivery": components["schemas"]["VerificationStatusDelivery"] };
  "VerifiedView": { "status": "VERIFIED" };
} }

export interface requestComponents { schemas: {
  "AISettingsView": { "default_profile_id": (string | null); "fallback_profile_id": (string | null); "model_matrix": Record<string, string>; "budgets": Record<string, unknown>; "revision": number };
  "AIStudentCreatedView": { "account_id": string; "membership_id": string; "alias": string; "persona_id": string; "model": string; "provider_profile_id"?: (string | null) };
  "AccountView": { "id": string; "username": string; "email": string; "email_masked"?: string; "verified": boolean; "authority_state"?: "EMAIL_VERIFICATION" | "FULL_PRODUCT"; "verification_delivery"?: (requestComponents["schemas"]["VerificationDelivery"] | null); "csrf_token": string; "points": number; "achievements": Array<string>; "locale"?: ("zh-Hant" | "zh-Hans" | "en" | "es" | null); "kind"?: "guest" | "expired_guest" | "registered"; "guest_expires_at"?: (number | null) };
  "ActivityDetailsUpdate": { "title"?: (string | null); "ends_at"?: (number | null) };
  "ActivityDraft": { "title": string; "starts_at"?: (number | null); "ends_at": number };
  "ActivityJoin": { "display_name": string };
  "ActivityJoinPreview": { "activity_id": string; "title": string; "course_id": string; "course_name": string; "teacher_name": string; "starts_at": number; "ends_at": number; "status": "scheduled" | "open" | "ended"; "already_enrolled": boolean; "default_display_name": string };
  "ActivityJoinResult": { "course_id": string; "activity_id": string; "enrolled_now": boolean };
  "ActivityStudentCard": { "id": string; "title": string; "status": "scheduled" | "open" | "ended"; "starts_at": number; "ends_at": number };
  "ActivityStudentList": { "role": "student"; "items": Array<requestComponents["schemas"]["ActivityStudentCard"]> };
  "ActivityTeacherCard": { "id": string; "title": string; "status": "draft" | "scheduled" | "open" | "ended"; "locked": boolean; "has_unpublished_changes": boolean; "starts_at": (number | null); "ends_at": (number | null); "available_actions": Array<"update" | "update_details" | "publish" | "start_now" | "end_now" | "copy" | "delete"> };
  "ActivityTeacherList": { "role": "teacher"; "items": Array<requestComponents["schemas"]["ActivityTeacherCard"]> };
  "ActivityTeacherView": { "id": string; "course_id": string; "status": "draft" | "scheduled" | "open" | "ended"; "locked": boolean; "has_unpublished_changes": boolean; "revision": (number | null); "draft": requestComponents["schemas"]["ActivityDraft"]; "starts_at": (number | null); "ends_at": (number | null); "available_actions": Array<"update" | "update_details" | "publish" | "start_now" | "end_now" | "copy" | "delete"> };
  "AddAIStudents": { "action_id": string; "count": number; "model"?: string; "provider_profile_id"?: (string | null) };
  "AddAIStudentsReceipt": { "status": string; "action_id": string; "seq": number; "room_id": string; "created": Array<requestComponents["schemas"]["AIStudentCreatedView"]>; "roster_digest": string };
  "AnalysisEdgeView": { "source": string; "target": string; "type": "supports" | "challenges" | "qualifies" | "revises"; "provenance": "student_selected_relation" | "confirmation_snapshot" };
  "AnalysisGroupView": { "id": string; "label": string; "phase": string; "snapshot_id": string; "settlement": requestComponents["schemas"]["SettlementView"]; "persons": Array<requestComponents["schemas"]["AnalysisPersonView"]>; "nodes": Array<requestComponents["schemas"]["AnalysisNodeView"]>; "edges": Array<requestComponents["schemas"]["AnalysisEdgeView"]>; "tree_projection": Array<requestComponents["schemas"]["AnalysisTreeNodeView"]>; "roots": Array<string>; "stances": Array<requestComponents["schemas"]["GroupStanceView"]> };
  "AnalysisNodeView": { "id": string; "person_id": string; "nickname": string; "text": string; "at": number; "sequence": number; "stage": string; "question_index": number; "kind": "statement" | "post_ack_observation" | "confirmed_viewpoint"; "provenance": "student_original_quote" | "student_explicit_confirmation"; "visibility"?: ("personal" | "stage" | "group_shared" | null); "summary_digest"?: (string | null) };
  "AnalysisPersonView": { "id": string; "nickname": string; "confirmed": boolean; "confirmation_digest": (string | null); "timeline": Array<requestComponents["schemas"]["AnalysisNodeView"]> };
  "AnalysisTreeNodeView": { "id": string; "parent": (string | null); "cross_references": Array<requestComponents["schemas"]["AnalysisEdgeView"]> };
  "AttachScript": { "action_id": string; "script_id"?: (string | null); "document"?: (Record<string, unknown> | null) };
  "AttachedScriptView": { "id": string; "revision": number; "document": Record<string, unknown>; "classroom_id": string };
  "BankImportResult": { "id": string; "revision": number; "question_id": string; "document": requestComponents["schemas"]["ScriptDocument"] };
  "BankMutation": { "action_id": string };
  "BankQuestionDetail": { "id": string; "title": string; "tags": Array<string>; "scenario_excerpt": string; "option_count": number; "author": (string | null); "mine": boolean; "published_at": number; "revision": number; "source_script_id"?: (string | null); "source_question_id"?: (string | null); "question": requestComponents["schemas"]["Question"] };
  "BankQuestionSummary": { "id": string; "title": string; "tags": Array<string>; "scenario_excerpt": string; "option_count": number; "author": (string | null); "mine": boolean; "published_at": number; "revision": number; "source_script_id"?: (string | null); "source_question_id"?: (string | null) };
  "BankSearchResult": { "items": Array<requestComponents["schemas"]["BankQuestionSummary"]>; "total": number; "offset": number; "limit": number };
  "BankUnpublishResult": { "id": string; "status": string };
  "ChartSemanticsView": { "sunburst": string; "sankey": string; "graph": string; "heatmap": string; "timeline": string };
  "CitationSourceView": { /** ID of the student message whose exact text contains quote. */ "message_id": string; /** Exact, unnormalised substring of the referenced SoloMessageView.text. */ "quote": string; /** Zero-based inclusive offset in UTF-16 code units to quote's first exact occurrence in SoloMessageView.text. */ "start": number; /** Zero-based exclusive offset in UTF-16 code units into SoloMessageView.text; text.slice(start, end) equals quote. */ "end": number };
  "ClassroomAISettingsView": { "default_profile_id"?: (string | null); "fallback_profile_id"?: (string | null); "model_matrix"?: Record<string, string>; "scenario_overrides"?: Record<string, unknown>; "budgets"?: Record<string, unknown>; "revision"?: number };
  "ClassroomActionReceipt": { "status": string; "action_id": string; "seq": number; "room_id"?: (string | null) };
  "ClassroomBatchView": { "id": string; "classroom_id": string; "batch_id": string; "code": (string | null) };
  "ClassroomEventPage": { "events": Array<requestComponents["schemas"]["ClassroomEventView"]>; "latest_seq": number; "more": boolean };
  "ClassroomEventView": { "seq": number; "type": string; "payload": Record<string, unknown> };
  "ClearAIStudents": { "action_id": string };
  "ClearAIStudentsReceipt": { "status": string; "action_id": string; "seq": number; "room_id": string; "removed": number; "roster_digest": string };
  "Command": { "action_id": string; "kind": "start" | "draft" | "answer" | "barrage" | "focus_message" | "next" | "end" | "approve_question" | "regenerate_question" | "personal_summary"; "data"?: Record<string, unknown> };
  "Configure": { "action_id": string; "expected_roster_digest": string; "group_count": number; "members_per_group": number; "assignments"?: Record<string, number>; "avatar_pack_id"?: string };
  "ConfirmViewpointBody": { "summary_digest": string };
  "ConnectionTestView": { "status": "READY"; "provider_profile_id": string; "adapter": "openrouter" | "openai" | "anthropic" | "gemini" | "openai-compatible"; "model_count": number; "sample": Array<requestComponents["schemas"]["DiscoveredModel"]>; "observed_at": number };
  "CourseCreate": { "name": string; "teacher_name": string; "intro"?: string; "goals"?: string };
  "CourseJoin": { "code": string; "display_name": string };
  "CourseLearningCard": { "id": string; "name": string; "teacher_name": string; "open_activity_count": number; "highlight": (requestComponents["schemas"]["ActivityStudentCard"] | null) };
  "CourseLists": { "teaching": Array<requestComponents["schemas"]["CourseTeachingCard"]>; "learning": Array<requestComponents["schemas"]["CourseLearningCard"]> };
  "CourseStudentView": { "role": "student"; "id": string; "name": string; "teacher_name": string; "intro": string; "code": (string | null); "display_name": string };
  "CourseTeacherView": { "role": "teacher"; "id": string; "name": string; "teacher_name": string; "intro": string; "goals": string; "code": string; "code_enabled": boolean; "student_count": number; "activity_count": number; "available_actions": Array<"update" | "rotate_code" | "disable_code" | "enable_code" | "create_activity"> };
  "CourseTeachingCard": { "id": string; "name": string; "teacher_name": string; "code": string; "code_enabled": boolean; "student_count": number; "activity_count": number; "open_activity_count": number };
  "CourseUpdate": { "name"?: (string | null); "teacher_name"?: (string | null); "intro"?: (string | null); "goals"?: (string | null) };
  "CreateBatch": { "action_id": string; "script_id": string };
  "CreateClassroom": { "action_id": string; "title": string };
  "CreateProfile": { "name": string; "adapter": string; "base_url"?: (string | null); "organization"?: (string | null); "project"?: (string | null); "default_model": string; "credential_mode"?: "PERSISTENT" | "SESSION"; "credential"?: (string | null) };
  "CreateRoom": { "script_id": string };
  "CredentialUpdate": { "credential": string; "credential_mode": "PERSISTENT" | "SESSION" };
  "DemoAccountView": { "username": string; "role": "teacher" | "student" };
  "DemoLoginView": { "password": string; "accounts": Array<requestComponents["schemas"]["DemoAccountView"]> };
  "DiscoveredModel": { "id": string; "name": (string | null); "pricing"?: unknown; "supported_parameters": Array<string>; "structured_outputs": (boolean | null); "reasoning": (Record<string, unknown> | null) };
  "GroupActionReceipt": { "status": string; "action_id": string; "seq": number; "room_id"?: (string | null) };
  "GroupAnalysisView": { "schema": "socrates/group-analysis/v1"; "classroom_id": string; "title": string; "groups": Array<requestComponents["schemas"]["AnalysisGroupView"]>; "basis": "attributed_original_quotes"; "identity": "nickname_and_classroom_scoped_pseudonym"; "chart_semantics": requestComponents["schemas"]["ChartSemanticsView"] };
  "GroupCollectionView": { "kind": "GroupCollection"; "id": string; "role": "teacher" | "student"; "route"?: (Record<string, string> | null); "title"?: (string | null); "phase"?: (string | null); "code"?: (string | null); "asset_classroom_id"?: (string | null); "ai_settings"?: (requestComponents["schemas"]["ClassroomAISettingsView"] | null); "features"?: (Record<string, unknown> | null); "roster"?: Array<Record<string, unknown>>; "roster_digest"?: (string | null); "configuration"?: (Record<string, unknown> | null); "groups"?: Array<Record<string, unknown>>; "available_actions"?: Array<string>; "unavailable_actions"?: Record<string, string> };
  "GroupCommand": { "action_id": string; "kind": string; "data"?: Record<string, unknown> };
  "GroupMemberIdentityView": { "username": string; "scope": "teacher_hover_only" };
  "GroupMetaView": { "id": string; "number": number; "label": string };
  "GroupRunView": { "kind": "GroupRun"; "id": string; "role": "teacher" | "student"; "seq": number; "title": string; "phase": string; "deadline_at": (number | null); "member_id": (string | null); "members": Array<Record<string, unknown>>; "runtime_mode": string; "session_batch_id": string; "group_label": string; "classroom_id": string; "question": (requestComponents["schemas"]["PublicQuestion"] | null); "transcript": Array<Record<string, unknown>>; "arguments": Array<Record<string, unknown>>; "edges": Array<Record<string, unknown>>; "settlement": Record<string, unknown>; "confirmed_members": Array<string>; "my_summary": (Record<string, unknown> | null); "avatar_pack_id": string; "source_mode": string; "focus_notice"?: unknown; "personal"?: (Record<string, unknown> | null); "available_actions"?: Array<string>; "unavailable_actions"?: Record<string, string>; "personal_progress"?: (Record<string, unknown> | null); "personal_overview"?: (Array<Record<string, unknown>> | null) };
  "GroupStanceView": { "question_index": number; "question_id": string; "question_title": string; "run_id": string; "run_phase": string; "basis": "personal_baseline"; "members": number; "confirmed": number; "unconfirmed": number; "unconfirmed_by_status": Record<string, number>; "options": Array<requestComponents["schemas"]["StanceOptionView"]>; "differing": boolean };
  "GroupStartReceipt": { "status": string; "action_id": string; "seq": number; "room_id"?: (string | null); "groups": Array<requestComponents["schemas"]["GroupMetaView"]>; "snapshot_id": string };
  "GuestJoin": { "nickname": string; "locale": "zh-Hant" | "zh-Hans" | "en" | "es" };
  "GuestUpgrade": { "username": string; "email": string; "password": string };
  "HTTPValidationError": { "detail"?: Array<requestComponents["schemas"]["ValidationError"]> };
  "ImportQuestion": { "action_id": string; "script_id": string };
  "JoinPreview": { "course_id": string; "name": string; "teacher_name": string; "already_enrolled": boolean; "default_display_name": string; "open_activity_title": (string | null) };
  "JoinRoom": { "code": string; "alias": string; "avatar"?: string };
  "LegacyGroupView": { "kind": "Legacy"; "id": string };
  "LibraryClassroomDetailView": { "id": string; "title": string; "revision": number; "assets": Record<string, unknown>; "scripts": Array<Record<string, unknown>>; "sessions": Array<Record<string, unknown>>; "lessons": Array<Record<string, unknown>> };
  "LibraryClassroomView": { "id": string; "title": string; "revision": number };
  "LocaleUpdate": { "locale": "zh-Hant" | "zh-Hans" | "en" | "es" };
  "Login": { "login": string; "password": string };
  "MailRequest": { "email": string };
  "MailRequestView": { "status": "REQUEST_RECORDED"; "message": string };
  "MemberView": { "id": string; "alias": string; "avatar": string; "seat": number; "online": boolean; "points": number; "achievements": Array<string>; "username"?: (string | null); "actor_type"?: "human" | "llm_student"; "persona_id"?: (string | null) };
  "ModelDiscoveryView": { "provider_profile_id": string; "adapter": "openrouter" | "openai" | "anthropic" | "gemini" | "openai-compatible"; "models": Array<requestComponents["schemas"]["DiscoveredModel"]>; "manual_model_id_allowed": boolean; "observed_at": number };
  "Option": { "id": string; "text": string };
  "OtherSuggestionRequest": { "question_id": string; "title": string; "scenario": string; "existing_options"?: Array<string>; "room_id"?: (string | null) };
  "OtherSuggestionView": { "suggestion_text": string; "suggestion_id": string; "suggestion_model"?: (string | null); "suggestion_provider": string; "provider_profile_id"?: (string | null); "classroom_owner_id"?: (string | null) };
  "PasswordResetView": { "status": "PASSWORD_RESET" };
  "PersonalSummaryView": { "current_position": string; "reason_summary": string; "relevant_conditions": Array<string>; "unresolved_issue": string; "principle_note"?: string; "sources"?: Array<requestComponents["schemas"]["CitationSourceView"]> };
  "ProfileDeletedView": { "status": "DELETED"; "profile_id": string };
  "ProfileView": { "id": string; "name": string; "adapter": "openrouter" | "openai" | "anthropic" | "gemini" | "openai-compatible"; "base_url": (string | null); "organization": (string | null); "project": (string | null); "default_model": string; "credential_mode": "PERSISTENT" | "SESSION"; "has_credential": boolean; "secret_last4": (string | null); "enabled": boolean; "metadata": Record<string, unknown>; "updated_at": number };
  "PublicConfigView": { "google_cse_id": string; "search_scope": string; "search_state": string; "debug_mode": boolean; "demo_login"?: (requestComponents["schemas"]["DemoLoginView"] | null) };
  "PublicJoinPreview": { "course_name": string };
  "PublicQuestion": { "id": string; "title": string; "scenario": string; "options": Array<requestComponents["schemas"]["Option"]>; "duration_seconds"?: number; "argument_required"?: boolean; "tutor_goal"?: string; "probe_hints"?: Array<string>; "max_focus_turns"?: number; "focus_response_seconds"?: number; "sender_point_cap"?: number; "receiver_point_cap"?: number; "max_personal_turns"?: number; "personal_seconds"?: number };
  "Publish": { "action_id": string; "script_id": string; "question_id": string; "title"?: (string | null); "tags"?: Array<string> };
  "Question": { "id": string; "title": string; "scenario": string; "options": Array<requestComponents["schemas"]["Option"]>; "duration_seconds"?: number; "argument_required"?: boolean; "tutor_goal"?: string; "probe_hints"?: Array<string>; "max_focus_turns"?: number; "focus_response_seconds"?: number; "sender_point_cap"?: number; "receiver_point_cap"?: number; "max_personal_turns"?: number; "personal_seconds"?: number; "scenario_ai"?: (requestComponents["schemas"]["ScenarioAI"] | null) };
  "Reaction": { "action_id": string; "kind": "heart" | "like" | "gift"; "focus_id": string; "turn_index": number };
  "ReadinessView": { "status": "ready"; "database": "connected"; "runtime": "classroom" };
  "Register": { "username": string; "email": string; "password": string };
  "ResendWebhookView": { "status": "RECORDED"; "matched": boolean; "provider_status"?: (string | null) };
  "ResetRequest": { "token": string; "password": string };
  "RevisionView": { "schema": "socrates/revision/v1"; "source_sha": string; "worktree_sha256": string; "environment": string; "feature_revision": number; "provider_profiles": boolean; "classroom_owner_routing": boolean; "observed_at": number };
  "RoomBudgetView": { "live_llm_call_budget": number; "used": number };
  "RoomSummary": { "id": string; "title": string; "phase": string; "teacher": boolean };
  "RoomView": { "id": string; "code": (string | null); "title": string; "role": "teacher" | "student"; "member_id": (string | null); "phase": string; "seq": number; "server_now": number; "deadline_at": (number | null); "question": (requestComponents["schemas"]["PublicQuestion"] | null); "question_index": number; "question_run_id": (string | null); "question_count": number; "members": Array<requestComponents["schemas"]["MemberView"]>; "my_draft": (Record<string, unknown> | null); "my_answer": (Record<string, unknown> | null); "distribution": Array<Record<string, unknown>>; "focus": (Record<string, unknown> | null); "transcript": Array<Record<string, unknown>>; "preview": (requestComponents["schemas"]["PublicQuestion"] | null); "summaries": Record<string, unknown>; "available_actions": Array<string>; "source_mode": string; "last_error": (string | null) };
  "SampleQuestionDraft": { "id": string; "title": string; "scenario": string; "options"?: Array<requestComponents["schemas"]["Option"]>; "duration_seconds"?: number; "argument_required"?: boolean; "tutor_goal"?: string; "probe_hints"?: Array<string>; "max_focus_turns"?: number; "focus_response_seconds"?: number; "sender_point_cap"?: number; "receiver_point_cap"?: number; "max_personal_turns"?: number; "personal_seconds"?: number };
  "SampleQuestionSet": { "title": string; "questions": Array<requestComponents["schemas"]["SampleQuestionDraft"]> };
  "ScenarioAI": { "provider_profile_id": string; "model": string };
  "ScriptAssistRequest": { "request": string; "document"?: Record<string, unknown>; "question_index"?: (number | null); "script_id"?: (string | null) };
  "ScriptAssistView": { "question": requestComponents["schemas"]["PublicQuestion"]; "question_index": (number | null); "rationale": string; "model": (string | null); "provider": (string | null) };
  "ScriptDocument": { "title": string; "mode"?: "static" | "dynamic"; "questions": Array<requestComponents["schemas"]["Question"]>; "max_questions"?: number; "preview_seconds"?: number; "live_llm_call_budget"?: number };
  "ScriptRevisionView": { "id": string; "revision": number };
  "ScriptSave": { "document": requestComponents["schemas"]["ScriptDocument"]; "expected_revision"?: (number | null) };
  "ScriptView": { "id": string; "revision": number; "document": Record<string, unknown> };
  "SendMessageBody": { "text": string; "revise_hint"?: ("stance" | "reason" | "condition" | "changed_mind" | null) };
  "SettingsUpdate": { "default_profile_id"?: (string | null); "fallback_profile_id"?: (string | null); "model_matrix"?: Record<string, string>; "budgets"?: Record<string, unknown>; "active_room_id"?: (string | null) };
  "SettlementView": { "state": "EXPLORING" | "CURRENT_PHASE_FINISHING" | "FINAL_STAGE" | "SETTLED"; "latched_at"?: (number | null); "latched_phase"?: (string | null); "final_stage_count"?: (number | null); "started_at"?: (number | null); "settled_at"?: (number | null); "ended_by"?: ("system" | "teacher" | null); "end_reason"?: ("final_stage_complete" | "teacher_force_end" | null); "incomplete_members"?: (Array<string> | null); "member_status"?: (Record<string, "confirmed" | "incomplete"> | null) };
  "SignedOutView": { "status": "SIGNED_OUT" };
  "SoloActivityAnalysisView": { "activity_id": string; "title": string; "course_id": string; "course_name": string; "status": "draft" | "scheduled" | "open" | "ended"; "ends_at": (number | null); "generated_at": number; "revision_id": (string | null); "summary": requestComponents["schemas"]["SoloAnalysisSummaryView"]; "students": Array<requestComponents["schemas"]["SoloAnalysisStudentView"]> };
  "SoloActivityProgressView": { "activity_id": string; "title": string; "course_id": string; "course_name": string; "status": "draft" | "scheduled" | "open" | "ended"; "ends_at": (number | null); "generated_at": number; "summary": requestComponents["schemas"]["SoloProgressSummaryView"]; "students": Array<requestComponents["schemas"]["SoloStudentProgressView"]> };
  "SoloActivityView": { "activity_id": string; "title": string; "course_id": string; "course_name": string; "status": "scheduled" | "open" | "ended"; "ends_at": number; "attempt": (requestComponents["schemas"]["SoloAttemptBrief"] | null) };
  "SoloAnalysisStudentView": { "enrollment_id": string; "display_name": string; "confirmed_scenarios": number; "current_position": string; "reason_summary": string; "relevant_conditions": Array<string> };
  "SoloAnalysisSummaryView": { "enrolled": number; "started": number; "done": number; "in_progress": number };
  "SoloAttemptBrief": { "id": string; "state": "answering" | "awaiting_tutor" | "tutor_unavailable" | "in_dialogue" | "confirming" | "between_scenarios" | "reviewing" | "awaiting_reflection_prompt" | "reflecting" | "budget_exhausted" | "completed"; "scenario_index": number; "progress": Array<requestComponents["schemas"]["SoloScenarioProgressView"]>; "review_status": "not_started" | "in_progress"; "current_turn": number };
  "SoloAttemptView": { "id": string; "activity_id": string; "activity_title": string; "course_id": string; "course_name": string; "display_name": string; "state": "answering" | "awaiting_tutor" | "tutor_unavailable" | "in_dialogue" | "confirming" | "between_scenarios" | "reviewing" | "awaiting_reflection_prompt" | "reflecting" | "budget_exhausted" | "completed"; "scenario_index": number; "scenarios": Array<requestComponents["schemas"]["SoloScenarioView"]>; "messages": Array<requestComponents["schemas"]["SoloMessageView"]>; "candidate_summary": (requestComponents["schemas"]["PersonalSummaryView"] | null); "summary_digest": (string | null); "principle_hint": ("後果主義" | "義務論" | "混合" | null); "revising": boolean; "rejected_summary": (requestComponents["schemas"]["PersonalSummaryView"] | null); "notice": ("tutor_unavailable" | "owner_provider_missing" | null); "available_actions": Array<"send_message" | "retry" | "confirm_viewpoint" | "revise_viewpoint" | "next_scenario" | "submit_review" | "retry_reflection_prompt" | "continue_reflection" | "submit_reflection" | "continue_without_tutor"> };
  "SoloMessageView": { "id": string; "scenario_index": number; "role": "student" | "tutor"; "text": string; "created_at": number; "move": ("probe" | "clarify" | "challenge" | "reflect" | "summarize" | "hypothetical" | null); "revise_hint": ("stance" | "reason" | "condition" | "changed_mind" | null) };
  "SoloProgressCellView": { "status": "answering" | "in_dialogue" | "confirming" | "confirmed"; "turns": (number | null) };
  "SoloProgressSummaryView": { "enrolled": number; "started": number; "done": number; "attention": number };
  "SoloScenarioChangeView": { "condition": string; "before": string; "after": string };
  "SoloScenarioProgressView": { "index": number; "status": "in_dialogue" | "confirmed" };
  "SoloScenarioView": { "index": number; "id": string; "text": string; "change": (requestComponents["schemas"]["SoloScenarioChangeView"] | null); "answer": (string | null); "status": "in_progress" | "goal_met"; "confirmed_summary": (requestComponents["schemas"]["PersonalSummaryView"] | null) };
  "SoloStudentProgressView": { "enrollment_id": string; "display_name": string; "overall": "not_started" | "in_progress" | "done"; "cells": Array<requestComponents["schemas"]["SoloProgressCellView"]>; "review_status": "not_started" | "in_progress"; "last_activity_at": (number | null); "attention": boolean };
  "StanceOptionView": { "option_id": string; "text": string; "count": number; "percent": number };
  "Start": { "action_id": string; "expected_roster_digest": string; "accept_temporary_aliases"?: boolean };
  "TokenRequest": { "token": string };
  "UpdateProfile": { "name"?: (string | null); "base_url"?: (string | null); "organization"?: (string | null); "project"?: (string | null); "default_model"?: (string | null); "enabled"?: (boolean | null) };
  "ValidationError": { "loc": Array<(string | number)>; "msg": string; "type": string };
  "VerificationDelivery": { "mail_id": string; "delivery_state": string; "expires_at": number };
  "VerificationMailView": { "status": "REQUEST_RECORDED" | "ALREADY_VERIFIED"; "message": string; "delivery"?: (requestComponents["schemas"]["VerificationDelivery"] | null) };
  "VerificationStatusDelivery": { "state": string; "provider"?: (string | null); "provider_message_id"?: (string | null); "provider_status"?: (string | null); "attempts"?: (number | null); "created_at"?: (number | null); "updated_at"?: (number | null); "sent_at"?: (number | null); "delivered_at"?: (number | null); "last_error"?: (string | null); "preview_url"?: (string | null) };
  "VerificationStatusView": { "verified": boolean; "email_masked": string; "authority_state": "EMAIL_VERIFICATION" | "FULL_PRODUCT"; "delivery": requestComponents["schemas"]["VerificationStatusDelivery"] };
  "VerifiedView": { "status": "VERIFIED" };
} }

export interface paths {
  "/account/locale": {
    "put": { body: requestComponents["schemas"]["LocaleUpdate"]; bodyRequired: true; requestMedia: "application/json"; response: components["schemas"]["AccountView"]; responseMedia: "application/json"; path: never; query: never };
  };
  "/activities/{activity_id}": {
    "get": { body: never; bodyRequired: false; requestMedia: "none"; response: components["schemas"]["ActivityTeacherView"]; responseMedia: "application/json"; path: { "activity_id": string }; query: never };
    "put": { body: requestComponents["schemas"]["ActivityDraft"]; bodyRequired: true; requestMedia: "application/json"; response: components["schemas"]["ActivityTeacherView"]; responseMedia: "application/json"; path: { "activity_id": string }; query: never };
    "patch": { body: requestComponents["schemas"]["ActivityDetailsUpdate"]; bodyRequired: true; requestMedia: "application/json"; response: components["schemas"]["ActivityTeacherView"]; responseMedia: "application/json"; path: { "activity_id": string }; query: never };
    "delete": { body: never; bodyRequired: false; requestMedia: "none"; response: null; responseMedia: "none"; path: { "activity_id": string }; query: never };
  };
  "/activities/{activity_id}/copy": {
    "post": { body: never; bodyRequired: false; requestMedia: "none"; response: components["schemas"]["ActivityTeacherView"]; responseMedia: "application/json"; path: { "activity_id": string }; query: never };
  };
  "/activities/{activity_id}/join": {
    "post": { body: requestComponents["schemas"]["ActivityJoin"]; bodyRequired: true; requestMedia: "application/json"; response: components["schemas"]["ActivityJoinResult"]; responseMedia: "application/json"; path: { "activity_id": string }; query: never };
  };
  "/activities/{activity_id}/join-preview": {
    "get": { body: never; bodyRequired: false; requestMedia: "none"; response: components["schemas"]["ActivityJoinPreview"]; responseMedia: "application/json"; path: { "activity_id": string }; query: never };
  };
  "/activities/{activity_id}/public-preview": {
    "get": { body: never; bodyRequired: false; requestMedia: "none"; response: components["schemas"]["PublicJoinPreview"]; responseMedia: "application/json"; path: { "activity_id": string }; query: never };
  };
  "/activities/{activity_id}/{action}": {
    "post": { body: never; bodyRequired: false; requestMedia: "none"; response: components["schemas"]["ActivityTeacherView"]; responseMedia: "application/json"; path: { "activity_id": string; "action": "publish" | "start_now" | "end_now" }; query: never };
  };
  "/ai-settings/account": {
    "get": { body: never; bodyRequired: false; requestMedia: "none"; response: components["schemas"]["AISettingsView"]; responseMedia: "application/json"; path: never; query: never };
    "put": { body: requestComponents["schemas"]["SettingsUpdate"]; bodyRequired: true; requestMedia: "application/json"; response: components["schemas"]["AISettingsView"]; responseMedia: "application/json"; path: never; query: never };
  };
  "/auth/forgot-password": {
    "post": { body: requestComponents["schemas"]["MailRequest"]; bodyRequired: true; requestMedia: "application/json"; response: components["schemas"]["MailRequestView"]; responseMedia: "application/json"; path: never; query: never };
  };
  "/auth/guest": {
    "post": { body: requestComponents["schemas"]["GuestJoin"]; bodyRequired: true; requestMedia: "application/json"; response: components["schemas"]["AccountView"]; responseMedia: "application/json"; path: never; query: never };
  };
  "/auth/guest/upgrade": {
    "post": { body: requestComponents["schemas"]["GuestUpgrade"]; bodyRequired: true; requestMedia: "application/json"; response: components["schemas"]["AccountView"]; responseMedia: "application/json"; path: never; query: never };
  };
  "/auth/login": {
    "post": { body: requestComponents["schemas"]["Login"]; bodyRequired: true; requestMedia: "application/json"; response: components["schemas"]["AccountView"]; responseMedia: "application/json"; path: never; query: never };
  };
  "/auth/logout": {
    "post": { body: never; bodyRequired: false; requestMedia: "none"; response: components["schemas"]["SignedOutView"]; responseMedia: "application/json"; path: never; query: never };
  };
  "/auth/me": {
    "get": { body: never; bodyRequired: false; requestMedia: "none"; response: components["schemas"]["AccountView"]; responseMedia: "application/json"; path: never; query: never };
  };
  "/auth/register": {
    "post": { body: requestComponents["schemas"]["Register"]; bodyRequired: true; requestMedia: "application/json"; response: components["schemas"]["AccountView"]; responseMedia: "application/json"; path: never; query: never };
  };
  "/auth/reset-password": {
    "post": { body: requestComponents["schemas"]["ResetRequest"]; bodyRequired: true; requestMedia: "application/json"; response: components["schemas"]["PasswordResetView"]; responseMedia: "application/json"; path: never; query: never };
  };
  "/auth/verification-email": {
    "post": { body: requestComponents["schemas"]["MailRequest"]; bodyRequired: true; requestMedia: "application/json"; response: components["schemas"]["VerificationMailView"]; responseMedia: "application/json"; path: never; query: never };
  };
  "/auth/verification-status": {
    "get": { body: never; bodyRequired: false; requestMedia: "none"; response: components["schemas"]["VerificationStatusView"]; responseMedia: "application/json"; path: never; query: never };
  };
  "/auth/verify": {
    "post": { body: requestComponents["schemas"]["TokenRequest"]; bodyRequired: true; requestMedia: "application/json"; response: components["schemas"]["VerifiedView"]; responseMedia: "application/json"; path: never; query: never };
  };
  "/bank/questions": {
    "get": { body: never; bodyRequired: false; requestMedia: "none"; response: components["schemas"]["BankSearchResult"]; responseMedia: "application/json"; path: never; query: { "q"?: string; "offset"?: number; "limit"?: number; "mine"?: boolean } };
    "post": { body: requestComponents["schemas"]["Publish"]; bodyRequired: true; requestMedia: "application/json"; response: components["schemas"]["BankQuestionDetail"]; responseMedia: "application/json"; path: never; query: never };
  };
  "/bank/questions/{bank_id}": {
    "get": { body: never; bodyRequired: false; requestMedia: "none"; response: components["schemas"]["BankQuestionDetail"]; responseMedia: "application/json"; path: { "bank_id": string }; query: never };
  };
  "/bank/questions/{bank_id}/import": {
    "post": { body: requestComponents["schemas"]["ImportQuestion"]; bodyRequired: true; requestMedia: "application/json"; response: components["schemas"]["BankImportResult"]; responseMedia: "application/json"; path: { "bank_id": string }; query: never };
  };
  "/bank/questions/{bank_id}/unpublish": {
    "post": { body: requestComponents["schemas"]["BankMutation"]; bodyRequired: true; requestMedia: "application/json"; response: components["schemas"]["BankUnpublishResult"]; responseMedia: "application/json"; path: { "bank_id": string }; query: never };
  };
  "/classrooms": {
    "get": { body: never; bodyRequired: false; requestMedia: "none"; response: Array<components["schemas"]["RoomSummary"]>; responseMedia: "application/json"; path: never; query: never };
    "post": { body: requestComponents["schemas"]["CreateRoom"]; bodyRequired: true; requestMedia: "application/json"; response: components["schemas"]["RoomView"]; responseMedia: "application/json"; path: never; query: never };
  };
  "/classrooms/join": {
    "post": { body: requestComponents["schemas"]["JoinRoom"]; bodyRequired: true; requestMedia: "application/json"; response: components["schemas"]["RoomView"]; responseMedia: "application/json"; path: never; query: never };
  };
  "/classrooms/{room_id}": {
    "get": { body: never; bodyRequired: false; requestMedia: "none"; response: components["schemas"]["RoomView"]; responseMedia: "application/json"; path: { "room_id": string }; query: { "mode"?: string } };
  };
  "/classrooms/{room_id}/budget": {
    "post": { body: never; bodyRequired: false; requestMedia: "none"; response: components["schemas"]["RoomBudgetView"]; responseMedia: "application/json"; path: { "room_id": string }; query: { "live_llm_call_budget": number } };
  };
  "/classrooms/{room_id}/commands": {
    "post": { body: requestComponents["schemas"]["Command"]; bodyRequired: true; requestMedia: "application/json"; response: components["schemas"]["ClassroomActionReceipt"]; responseMedia: "application/json"; path: { "room_id": string }; query: never };
  };
  "/classrooms/{room_id}/events": {
    "get": { body: never; bodyRequired: false; requestMedia: "none"; response: components["schemas"]["ClassroomEventPage"]; responseMedia: "application/json"; path: { "room_id": string }; query: { "after"?: number } };
  };
  "/classrooms/{room_id}/reactions": {
    "post": { body: requestComponents["schemas"]["Reaction"]; bodyRequired: true; requestMedia: "application/json"; response: components["schemas"]["ClassroomActionReceipt"]; responseMedia: "application/json"; path: { "room_id": string }; query: never };
  };
  "/course-join/preview": {
    "get": { body: never; bodyRequired: false; requestMedia: "none"; response: components["schemas"]["JoinPreview"]; responseMedia: "application/json"; path: never; query: { "code": string } };
  };
  "/course-join/public-preview": {
    "get": { body: never; bodyRequired: false; requestMedia: "none"; response: components["schemas"]["PublicJoinPreview"]; responseMedia: "application/json"; path: never; query: { "code": string } };
  };
  "/courses": {
    "get": { body: never; bodyRequired: false; requestMedia: "none"; response: components["schemas"]["CourseLists"]; responseMedia: "application/json"; path: never; query: never };
    "post": { body: requestComponents["schemas"]["CourseCreate"]; bodyRequired: true; requestMedia: "application/json"; response: components["schemas"]["CourseTeacherView"]; responseMedia: "application/json"; path: never; query: never };
  };
  "/courses/join": {
    "post": { body: requestComponents["schemas"]["CourseJoin"]; bodyRequired: true; requestMedia: "application/json"; response: components["schemas"]["CourseStudentView"]; responseMedia: "application/json"; path: never; query: never };
  };
  "/courses/{course_id}": {
    "get": { body: never; bodyRequired: false; requestMedia: "none"; response: (components["schemas"]["CourseTeacherView"] | components["schemas"]["CourseStudentView"]); responseMedia: "application/json"; path: { "course_id": string }; query: { "role"?: ("teacher" | "student" | null) } };
    "patch": { body: requestComponents["schemas"]["CourseUpdate"]; bodyRequired: true; requestMedia: "application/json"; response: components["schemas"]["CourseTeacherView"]; responseMedia: "application/json"; path: { "course_id": string }; query: never };
  };
  "/courses/{course_id}/activities": {
    "get": { body: never; bodyRequired: false; requestMedia: "none"; response: (components["schemas"]["ActivityTeacherList"] | components["schemas"]["ActivityStudentList"]); responseMedia: "application/json"; path: { "course_id": string }; query: { "role"?: ("teacher" | "student" | null) } };
    "post": { body: requestComponents["schemas"]["ActivityDraft"]; bodyRequired: true; requestMedia: "application/json"; response: components["schemas"]["ActivityTeacherView"]; responseMedia: "application/json"; path: { "course_id": string }; query: never };
  };
  "/courses/{course_id}/{action}": {
    "post": { body: never; bodyRequired: false; requestMedia: "none"; response: components["schemas"]["CourseTeacherView"]; responseMedia: "application/json"; path: { "course_id": string; "action": "rotate_code" | "disable_code" | "enable_code" }; query: never };
  };
  "/groups/classrooms/{rid}": {
    "get": { body: never; bodyRequired: false; requestMedia: "none"; response: (components["schemas"]["GroupCollectionView"] | components["schemas"]["GroupRunView"] | components["schemas"]["LegacyGroupView"]); responseMedia: "application/json"; path: { "rid": string }; query: never };
  };
  "/groups/classrooms/{rid}/ai-students": {
    "post": { body: requestComponents["schemas"]["AddAIStudents"]; bodyRequired: true; requestMedia: "application/json"; response: components["schemas"]["AddAIStudentsReceipt"]; responseMedia: "application/json"; path: { "rid": string }; query: never };
  };
  "/groups/classrooms/{rid}/ai-students/clear": {
    "post": { body: requestComponents["schemas"]["ClearAIStudents"]; bodyRequired: true; requestMedia: "application/json"; response: components["schemas"]["ClearAIStudentsReceipt"]; responseMedia: "application/json"; path: { "rid": string }; query: never };
  };
  "/groups/classrooms/{rid}/analysis": {
    "get": { body: never; bodyRequired: false; requestMedia: "none"; response: components["schemas"]["GroupAnalysisView"]; responseMedia: "application/json"; path: { "rid": string }; query: never };
  };
  "/groups/classrooms/{rid}/configure": {
    "post": { body: requestComponents["schemas"]["Configure"]; bodyRequired: true; requestMedia: "application/json"; response: components["schemas"]["GroupActionReceipt"]; responseMedia: "application/json"; path: { "rid": string }; query: never };
  };
  "/groups/classrooms/{rid}/start": {
    "post": { body: requestComponents["schemas"]["Start"]; bodyRequired: true; requestMedia: "application/json"; response: components["schemas"]["GroupStartReceipt"]; responseMedia: "application/json"; path: { "rid": string }; query: never };
  };
  "/groups/runs/{rid}/commands": {
    "post": { body: requestComponents["schemas"]["GroupCommand"]; bodyRequired: true; requestMedia: "application/json"; response: components["schemas"]["GroupActionReceipt"]; responseMedia: "application/json"; path: { "rid": string }; query: never };
  };
  "/groups/runs/{rid}/members/{mid}/identity": {
    "get": { body: never; bodyRequired: false; requestMedia: "none"; response: components["schemas"]["GroupMemberIdentityView"]; responseMedia: "application/json"; path: { "rid": string; "mid": string }; query: never };
  };
  "/library/classrooms": {
    "get": { body: never; bodyRequired: false; requestMedia: "none"; response: Array<components["schemas"]["LibraryClassroomView"]>; responseMedia: "application/json"; path: never; query: never };
    "post": { body: requestComponents["schemas"]["CreateClassroom"]; bodyRequired: true; requestMedia: "application/json"; response: components["schemas"]["LibraryClassroomView"]; responseMedia: "application/json"; path: never; query: never };
  };
  "/library/classrooms/{cid}": {
    "get": { body: never; bodyRequired: false; requestMedia: "none"; response: components["schemas"]["LibraryClassroomDetailView"]; responseMedia: "application/json"; path: { "cid": string }; query: never };
  };
  "/library/classrooms/{cid}/ai-settings": {
    "get": { body: never; bodyRequired: false; requestMedia: "none"; response: components["schemas"]["ClassroomAISettingsView"]; responseMedia: "application/json"; path: { "cid": string }; query: never };
    "put": { body: requestComponents["schemas"]["SettingsUpdate"]; bodyRequired: true; requestMedia: "application/json"; response: components["schemas"]["ClassroomAISettingsView"]; responseMedia: "application/json"; path: { "cid": string }; query: never };
  };
  "/library/classrooms/{cid}/batches": {
    "post": { body: requestComponents["schemas"]["CreateBatch"]; bodyRequired: true; requestMedia: "application/json"; response: components["schemas"]["ClassroomBatchView"]; responseMedia: "application/json"; path: { "cid": string }; query: never };
  };
  "/library/classrooms/{cid}/scripts": {
    "post": { body: requestComponents["schemas"]["AttachScript"]; bodyRequired: true; requestMedia: "application/json"; response: components["schemas"]["AttachedScriptView"]; responseMedia: "application/json"; path: { "cid": string }; query: never };
  };
  "/meta/revision": {
    "get": { body: never; bodyRequired: false; requestMedia: "none"; response: components["schemas"]["RevisionView"]; responseMedia: "application/json"; path: never; query: never };
  };
  "/provider-profiles": {
    "get": { body: never; bodyRequired: false; requestMedia: "none"; response: Array<components["schemas"]["ProfileView"]>; responseMedia: "application/json"; path: never; query: never };
    "post": { body: requestComponents["schemas"]["CreateProfile"]; bodyRequired: true; requestMedia: "application/json"; response: components["schemas"]["ProfileView"]; responseMedia: "application/json"; path: never; query: never };
  };
  "/provider-profiles/{profile_id}": {
    "patch": { body: requestComponents["schemas"]["UpdateProfile"]; bodyRequired: true; requestMedia: "application/json"; response: components["schemas"]["ProfileView"]; responseMedia: "application/json"; path: { "profile_id": string }; query: never };
    "delete": { body: never; bodyRequired: false; requestMedia: "none"; response: components["schemas"]["ProfileDeletedView"]; responseMedia: "application/json"; path: { "profile_id": string }; query: never };
  };
  "/provider-profiles/{profile_id}/credential": {
    "post": { body: requestComponents["schemas"]["CredentialUpdate"]; bodyRequired: true; requestMedia: "application/json"; response: components["schemas"]["ProfileView"]; responseMedia: "application/json"; path: { "profile_id": string }; query: never };
  };
  "/provider-profiles/{profile_id}/models": {
    "get": { body: never; bodyRequired: false; requestMedia: "none"; response: components["schemas"]["ModelDiscoveryView"]; responseMedia: "application/json"; path: { "profile_id": string }; query: never };
  };
  "/provider-profiles/{profile_id}/test": {
    "post": { body: never; bodyRequired: false; requestMedia: "none"; response: components["schemas"]["ConnectionTestView"]; responseMedia: "application/json"; path: { "profile_id": string }; query: never };
  };
  "/public-config": {
    "get": { body: never; bodyRequired: false; requestMedia: "none"; response: components["schemas"]["PublicConfigView"]; responseMedia: "application/json"; path: never; query: never };
  };
  "/readiness": {
    "get": { body: never; bodyRequired: false; requestMedia: "none"; response: components["schemas"]["ReadinessView"]; responseMedia: "application/json"; path: never; query: never };
  };
  "/scripts": {
    "get": { body: never; bodyRequired: false; requestMedia: "none"; response: Array<components["schemas"]["ScriptView"]>; responseMedia: "application/json"; path: never; query: never };
    "post": { body: requestComponents["schemas"]["ScriptSave"]; bodyRequired: true; requestMedia: "application/json"; response: components["schemas"]["ScriptView"]; responseMedia: "application/json"; path: never; query: never };
  };
  "/scripts/assist": {
    "post": { body: requestComponents["schemas"]["ScriptAssistRequest"]; bodyRequired: true; requestMedia: "application/json"; response: components["schemas"]["ScriptAssistView"]; responseMedia: "application/json"; path: never; query: never };
  };
  "/scripts/import": {
    "post": { body: never; bodyRequired: false; requestMedia: "none"; response: components["schemas"]["ScriptView"]; responseMedia: "application/json"; path: never; query: never };
  };
  "/scripts/samples": {
    "get": { body: never; bodyRequired: false; requestMedia: "none"; response: components["schemas"]["SampleQuestionSet"]; responseMedia: "application/json"; path: never; query: never };
  };
  "/scripts/{script_id}": {
    "put": { body: requestComponents["schemas"]["ScriptSave"]; bodyRequired: true; requestMedia: "application/json"; response: components["schemas"]["ScriptView"]; responseMedia: "application/json"; path: { "script_id": string }; query: never };
  };
  "/scripts/{script_id}/adopt-question/{room_id}/{index}": {
    "post": { body: never; bodyRequired: false; requestMedia: "none"; response: components["schemas"]["ScriptRevisionView"]; responseMedia: "application/json"; path: { "script_id": string; "room_id": string; "index": number }; query: never };
  };
  "/scripts/{script_id}/yaml": {
    "get": { body: never; bodyRequired: false; requestMedia: "none"; response: string; responseMedia: "application/yaml"; path: { "script_id": string }; query: never };
  };
  "/solo/activities/{activity_id}": {
    "get": { body: never; bodyRequired: false; requestMedia: "none"; response: components["schemas"]["SoloActivityView"]; responseMedia: "application/json"; path: { "activity_id": string }; query: never };
  };
  "/solo/activities/{activity_id}/analysis": {
    "get": { body: never; bodyRequired: false; requestMedia: "none"; response: components["schemas"]["SoloActivityAnalysisView"]; responseMedia: "application/json"; path: { "activity_id": string }; query: never };
  };
  "/solo/activities/{activity_id}/attempt": {
    "post": { body: never; bodyRequired: false; requestMedia: "none"; response: components["schemas"]["SoloAttemptView"]; responseMedia: "application/json"; path: { "activity_id": string }; query: never };
  };
  "/solo/activities/{activity_id}/progress": {
    "get": { body: never; bodyRequired: false; requestMedia: "none"; response: components["schemas"]["SoloActivityProgressView"]; responseMedia: "application/json"; path: { "activity_id": string }; query: never };
  };
  "/solo/attempts/{attempt_id}": {
    "get": { body: never; bodyRequired: false; requestMedia: "none"; response: components["schemas"]["SoloAttemptView"]; responseMedia: "application/json"; path: { "attempt_id": string }; query: never };
  };
  "/solo/attempts/{attempt_id}/{action}": {
    "post": { body: (requestComponents["schemas"]["SendMessageBody"] | requestComponents["schemas"]["ConfirmViewpointBody"] | null); bodyRequired: false; requestMedia: "application/json"; response: components["schemas"]["SoloAttemptView"]; responseMedia: "application/json"; path: { "attempt_id": string; "action": "send_message" | "retry" | "confirm_viewpoint" | "revise_viewpoint" | "next_scenario" | "submit_review" | "retry_reflection_prompt" | "continue_reflection" | "submit_reflection" | "continue_without_tutor" }; query: never };
  };
  "/suggestions/other": {
    "post": { body: requestComponents["schemas"]["OtherSuggestionRequest"]; bodyRequired: true; requestMedia: "application/json"; response: components["schemas"]["OtherSuggestionView"]; responseMedia: "application/json"; path: never; query: never };
  };
  "/webhooks/resend": {
    "post": { body: never; bodyRequired: false; requestMedia: "none"; response: components["schemas"]["ResendWebhookView"]; responseMedia: "application/json"; path: never; query: never };
  };
}

// Generated from backend/app/modules/contract/contracts.py.
export type ClassroomReasonCode = "ACCOUNT_DATA_TAKEN" | "ACCOUNT_PENDING_VERIFICATION" | "ACTION_ID_PAYLOAD_CONFLICT" | "ACTION_SCOPE_REQUIRED" | "ACTIVITY_ACTION_UNAVAILABLE" | "ACTIVITY_ENDED" | "ACTIVITY_LOCKED" | "ACTIVITY_NOT_FOUND" | "ACTIVITY_NOT_OPEN" | "ACTIVITY_TIME_INVALID" | "AI_BUDGET_REQUIRED" | "AI_MODEL_ID_REQUIRED" | "AI_ROLE_REQUIRED" | "ANSWER_ALREADY_SUBMITTED" | "ANSWER_WINDOW_CLOSED" | "API_ROUTE_JSON_REQUIRED" | "ARENA_REQUIRED" | "ARGUMENT_RELATION_REQUIRED" | "ARGUMENT_REQUIRED" | "ARGUMENT_SIZE" | "AUTH_INVALID_CREDENTIALS" | "AUTH_TOKEN_INVALID" | "BANK_IMPORT_INVALID" | "BANK_OWNER_REQUIRED" | "BANK_QUESTION_INVALID" | "BANK_QUESTION_REQUIRED" | "BANK_SCRIPT_QUESTION_LIMIT" | "BANK_SOURCE_QUESTION_REQUIRED" | "BARRAGE_SIZE" | "BUDGET_RANGE" | "CLASSROOM_ASSET_OWNER_REQUIRED" | "CLASSROOM_MEMBERSHIP_REQUIRED" | "CLASSROOM_OWNER_REQUIRED" | "CLASSROOM_PARENT_REQUIRED" | "CLASSROOM_REQUIRED" | "CLASSROOM_SCRIPT_REQUIRED" | "COMPLETE_FINAL_STAGE_REQUIRED" | "CONFIRMABLE_PHASE_REQUIRED" | "COURSE_ACTION_UNAVAILABLE" | "COURSE_CODE_EXHAUSTED" | "COURSE_CODE_NOT_FOUND" | "COURSE_CODE_REQUIRED" | "COURSE_NOT_FOUND" | "CURRENT_GROUP_CONFIGURATION_REQUIRED" | "CURRENT_PHASE_ACTIONS" | "CURRENT_POPULATED_ROSTER_REQUIRED" | "CURRENT_ROSTER_DIGEST_REQUIRED" | "CURRENT_ROSTER_REQUIRED" | "CURRENT_SUMMARY_DIGEST_REQUIRED" | "DIALOGUE_PHASE_REQUIRED" | "EMAIL_TAKEN" | "EMAIL_VERIFICATION_REQUIRED" | "ENROLL_CODE_NOT_FOUND" | "EXISTING_GROUP_ARGUMENT_REQUIRED" | "FOCUS_ID_REQUIRED" | "FOCUS_REQUIRED" | "FOCUS_TURN_REQUIRED" | "FRESH_ARGUMENT_ID_REQUIRED" | "GROUP_ALREADY_SETTLED" | "GROUP_CAPACITY_REQUIRED" | "GROUP_COMMAND_REQUIRED" | "GROUP_INDEX_REQUIRED" | "GROUP_MEMBERSHIP_REQUIRED" | "GROUP_MEMBER_REQUIRED" | "GROUP_RUN_REQUIRED" | "GUEST_EXPIRED" | "GUEST_NOT_ALLOWED" | "GUEST_ONLY" | "KNOWN_ACTION_REQUIRED" | "LOBBY_REQUIRED" | "LOGIN_REQUIRED" | "ORIGIN_BINDING_REQUIRED" | "PERSONAL_CONFIRM_REQUIRED" | "PERSONAL_DIALOGUE_REQUIRED" | "PERSONAL_RETRY_REQUIRED" | "PERSONAL_TURN_REQUIRED" | "PERSONAL_WINDOW_CLOSED" | "PREVIEW_REQUIRED" | "PROVIDER_ADAPTER_REQUIRED" | "PROVIDER_AVAILABILITY" | "PROVIDER_BASE_URL_REQUIRED" | "PROVIDER_CREDENTIAL_DECRYPTION" | "PROVIDER_CREDENTIAL_MALFORMED" | "PROVIDER_CREDENTIAL_REENTRY_REQUIRED" | "PROVIDER_CREDENTIAL_REQUIRED" | "PROVIDER_EMPTY_CONTENT" | "PROVIDER_HOST_RESOLUTION" | "PROVIDER_HTTPS_REQUIRED" | "PROVIDER_KEY_SOURCE_REQUIRED" | "PROVIDER_PROFILE_IN_ACCOUNT_SETTINGS" | "PROVIDER_PROFILE_IN_AI_STUDENT" | "PROVIDER_PROFILE_IN_CLASSROOM_SETTINGS" | "PROVIDER_PROFILE_IN_SCRIPT" | "PROVIDER_PROFILE_NAME_TAKEN" | "PROVIDER_PROFILE_OWNER_REQUIRED" | "PROVIDER_PUBLIC_ADDRESS_REQUIRED" | "PROVIDER_REDIRECT_BOUND" | "PROVIDER_REDIRECT_LOCATION" | "PROVIDER_RESPONSE_SIZE" | "PROVIDER_SCHEMA_MISMATCH" | "PROVIDER_TIMEOUT" | "QUESTION_ID_REQUIRED" | "QUESTION_OPTION_REQUIRED" | "QUESTION_REQUIRED" | "QUOTED_VIEWPOINT_REQUIRED" | "RATE_LIMITED" | "SCENARIO_AI_PROFILE_REQUIRED" | "SCRIPT_ASSIST_DRAFT_SIZE" | "SCRIPT_ASSIST_INVALID_OUTPUT" | "SCRIPT_ASSIST_MODEL_REQUIRED" | "SCRIPT_ASSIST_PROVIDER_REQUIRED" | "SCRIPT_OWNER_REQUIRED" | "SCRIPT_SAMPLES_UNAVAILABLE" | "SESSION_CSRF_REQUIRED" | "SOLO_ACTION_UNAVAILABLE" | "SOLO_ATTEMPT_NOT_FOUND" | "SOLO_MESSAGE_LIMIT" | "SOLO_REVISE_HINT_INVALID" | "SOLO_STEP_NOT_READY" | "SOLO_SUMMARY_STALE" | "STARTED_CLASSROOM_REQUIRED" | "STATEMENT_LENGTH_1_TO_12000" | "STUDENT_MEMBERSHIP_REQUIRED" | "SUMMARY_PHASE_REQUIRED" | "TEACHER_MEMBERSHIP_REQUIRED" | "TEACHER_TEMPORARY_ALIAS_CONFIRMATION_REQUIRED" | "TYPED_STATEMENT_AND_PARENT_IDS_REQUIRED" | "USERNAME_TAKEN";
