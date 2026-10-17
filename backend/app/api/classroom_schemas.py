"""Compatibility exports for the versioned classroom contracts.

New code imports the owning module under ``app.modules``. This file remains the
stable OpenAPI and test import surface while callers migrate.
"""

from app.modules.platform.contracts import (
    Strict,
)

from app.modules.content_authoring.contracts import (
    Option,
    ScenarioAI,
    PublicQuestion,
    SampleQuestionDraft,
    SampleQuestionSet,
    Question,
    public_question,
    ScriptDocument,
    ScriptSave,
    ScriptView,
    LibraryClassroomView,
    ScriptAssistRequest,
    ScriptAssistResult,
)

from app.modules.identity_access.contracts import (
    USERNAME_PATTERN,
    PASSWORD_SPECIALS,
    PASSWORD_MIN,
    PASSWORD_MAX,
    PASSWORD_RULE,
    password_policy,
    Register,
    Login,
    MailRequest,
    TokenRequest,
    ResetRequest,
    VerificationDelivery,
    AccountView,
)

from app.modules.llm_runtime.contracts import (
    Observations,
    Guard,
    TutorTurn,
    PersonalSummary,
    PersonalTutorTurn,
    SummaryResult,
    DynamicResult,
    LLMStudentTurn,
    OtherSuggestionResult,
)

from app.modules.classroom_core.contracts import (
    CreateRoom,
    JoinRoom,
    Command,
    Reaction,
    MemberView,
    RoomView,
)

__all__ = [
    "Strict",
    "Option",
    "ScenarioAI",
    "PublicQuestion",
    "SampleQuestionDraft",
    "SampleQuestionSet",
    "Question",
    "public_question",
    "ScriptDocument",
    "ScriptSave",
    "ScriptView",
    "LibraryClassroomView",
    "ScriptAssistRequest",
    "ScriptAssistResult",
    "USERNAME_PATTERN",
    "PASSWORD_SPECIALS",
    "PASSWORD_MIN",
    "PASSWORD_MAX",
    "PASSWORD_RULE",
    "password_policy",
    "Register",
    "Login",
    "MailRequest",
    "TokenRequest",
    "ResetRequest",
    "VerificationDelivery",
    "AccountView",
    "Observations",
    "Guard",
    "TutorTurn",
    "PersonalSummary",
    "PersonalTutorTurn",
    "SummaryResult",
    "DynamicResult",
    "LLMStudentTurn",
    "OtherSuggestionResult",
    "CreateRoom",
    "JoinRoom",
    "Command",
    "Reaction",
    "MemberView",
    "RoomView",
]
