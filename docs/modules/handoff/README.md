# 後端四包交接文件

期中考後由認領人接手（Arthur 10/20）。每包最多一位負責人，可從缺，Arthur 兜底。

| 包 | 名稱 | 模組 | 約略行數 | 文件 |
|---|---|---|---|---|
| A | 課堂 | classroom-core、group-dialogue、analytics | 4,922 | [A-classroom.md](A-classroom.md) |
| B | 出題、單人與底層 | content-authoring、solo-dialogue、platform、app-shell | 4,078 | [B-authoring-solo-base.md](B-authoring-solo-base.md) |
| C | 帳號與 AI | identity-access、ai-providers、llm-runtime | 3,590 | [C-account-ai.md](C-account-ai.md) |
| D | 對接 | contract | 224 | [D-contract.md](D-contract.md) |

對接（D 包）的下一步：補完 response_model、型別產生器產出每個端點的 request／response 型別、前端 client 依 path＋method 帶型別、錯誤碼產成 TS 型別。
