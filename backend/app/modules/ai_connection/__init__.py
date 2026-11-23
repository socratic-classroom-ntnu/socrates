"""老師的「AI 連線設定」: one connection per teacher, shared by every AI role, or the system AI.

`service` holds the form checks, the connection test and the model list that the 後台「系統 AI」
page uses too; each caller passes its own error-code prefix.
"""
