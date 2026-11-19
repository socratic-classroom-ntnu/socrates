"""The teacher's AI settings: OpenRouter with MODEL, the key read from local/openrouter.key.

The radar and the final summary use only the course owner's own settings, so this is the one key
the app runs on. The key goes to the app, which keeps it encrypted; it is never printed.

    python configure_ai.py
"""

from __future__ import annotations

from lab import KEY_FILE, MODEL, TEACHER, Api, read_key
from app.modules.solo_activity.service import ROLE

PROFILE_NAME = "OpenRouter（雷達實測）"


def main() -> None:
    key = read_key()
    teacher = Api().login(TEACHER)
    profiles = [p for p in teacher.get("/api/v2/provider-profiles") if p["name"] == PROFILE_NAME]
    if profiles:
        profile = profiles[0]
        teacher.post(
            f"/api/v2/provider-profiles/{profile['id']}/credential",
            json={"credential": key, "credential_mode": "PERSISTENT"},
        )
    else:
        profile = teacher.post(
            "/api/v2/provider-profiles",
            json={
                "name": PROFILE_NAME,
                "adapter": "openrouter",
                "default_model": MODEL,
                "credential": key,
            },
        )
    settings = teacher.put(
        "/api/v2/ai-settings/account",
        json={"default_profile_id": profile["id"], "model_matrix": {ROLE: MODEL}},
    )
    print(f"{TEACHER}: {profile['adapter']} {settings['model_matrix'][ROLE]} (key from {KEY_FILE})")


if __name__ == "__main__":
    main()
