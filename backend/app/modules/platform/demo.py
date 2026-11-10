"""測試帳號：哪些環境有、登入頁能不能一鍵填入。

seed（scripts/seed_preview.py）和 /public-config 共用這份名單，所以快速登入按鈕只會出現在
真的建過這些帳號的環境。密碼本來就寫在公開的 repo 裡，名單外的環境（正式環境）一律不建、不回傳。
"""

import os

# 必須是明確設定的值：其他地方把沒設定當成 local-dev，這裡不行，正式環境漏設不能變成公開帳密
DEMO_ENVIRONMENTS = frozenset({"local-dev", "preview", "stage", "dev"})
DEMO_PASSWORD = "preview-password"
# 登入頁的快速登入按鈕，依序顯示
DEMO_LOGIN_ACCOUNTS = (("teacher001", "teacher"), ("user001", "student"))


def demo_environment() -> bool:
    return os.environ.get("SOCRATES_ENVIRONMENT", "") in DEMO_ENVIRONMENTS


def demo_login() -> dict[str, object] | None:
    if not demo_environment():
        return None
    return {
        "password": DEMO_PASSWORD,
        "accounts": [{"username": name, "role": role} for name, role in DEMO_LOGIN_ACCOUNTS],
    }
