"""Every module's ORM rows join the shared metadata here, before any engine or migration uses it.

Platform owns the Base and the engine but never imports business modules; the app shell, which may
depend on all of them, loads each module's repositories so foreign keys between modules resolve.
"""

from importlib import import_module

MODEL_MODULES = (
    "app.modules.platform.repositories",
    "app.modules.identity_access.repositories",
    "app.modules.ai_providers.repositories",
    "app.modules.content_authoring.repositories",
    "app.modules.llm_runtime.repositories",
    "app.modules.classroom_core.repositories",
    "app.modules.group_dialogue.repositories",
    "app.modules.solo_dialogue.repositories",
    "app.modules.solo_dialogue.interaction_repositories",
)


def register_models() -> None:
    for module_name in MODEL_MODULES:
        import_module(module_name)


register_models()
