# 即時語音方案比較（原型）

語音技術驗證用的獨立原型：讓蘇格拉底用語音和學生對話，比較三種方案的首字延遲、花費與聽感。

| 方案 | 做法 |
|---|---|
| OpenAI Realtime | 語音進、語音出，單一模型 |
| Gemini Live | 語音進、語音出，單一模型 |
| Google 語音串接 | Cloud Speech-to-Text → Gemini 文字模型 → Cloud Text-to-Speech |

它不接教室後端與前端，題目固定為電車難題。OpenAI Realtime 由模型直接開口，教室後端的鐵則檢查不會在回話前生效；串接方案的中段可以換成教室後端的 LLM 流程。Gemini Live 的開場指示用教室後端 `solo_tutor` 的鐵則（`iron_rules.rules_for`，拿掉語音用不到的 guard 欄位那一行），並可切成「先檢查再開口」。

## Gemini Live 的兩種回答方式

在 dev 的 Gemini 方案卡選：

- **自動回答**：Gemini 自己判斷學生說完，立刻開口。
- **先檢查再開口**：關掉 Gemini 的自動輪替，由頁面判斷學生說完（靜音 650 ms），先把這一句錄音送 Cloud Speech-to-Text 轉成文字，跑教室後端的 `screen_input`；抓到要求換角色、忽略規則或索取設定時，在這一輪附一句提醒，檢查完才送「說完了」讓模型回答。學生在模型說話時開口一樣會打斷它。

Gemini Live 在「說完了」送出之前不給輸入逐字稿（實測等 4 秒都沒有），所以檢查要另外轉一份文字，這一步需要 Google Cloud 金鑰。Gemini 自己的逐字稿常是簡體，檢查前會把規則用到的字轉回繁體。教室後端的位置預設是同一個 repo 的 `backend/`，拷到別處跑時用環境變數 `VOICE_BACKEND_DIR` 指過去。

## 啟動

```bash
cd prototypes/voice-comparison
pip install -r requirements.txt
uvicorn server:app --host 127.0.0.1 --port 18990
```

開 <http://127.0.0.1:18990>。瀏覽器只在 localhost 或 https 底下給麥克風。

## 金鑰

點左邊「蘇格拉底」視窗進全螢幕 → 右上角切到 dev → 金鑰列填三把，按儲存：

- **OpenAI**：OpenAI API key
- **Gemini**：Google AI Studio 的 Gemini API key
- **Google Cloud**：服務帳戶金鑰 JSON 整份內容。專案要先啟用 Cloud Speech-to-Text API 與 Cloud Text-to-Speech API；這兩個 API 不收 API key，只收 OAuth，伺服器會用服務帳戶自己換 token。

金鑰只寫入伺服器的 `VOICE_SECRETS_DIR`（預設是本目錄的 `secrets/`，檔案權限 0600），頁面只顯示「已設定／未設定」，不會回傳金鑰內容。

## 畫面

- **文字模式**（預設）：左邊是題目、蘇格拉底浮動視窗與說明，右邊是對話與輸入框。
- **全螢幕 dev**：三個方案的已用金額與平均首字延遲、模型選擇、金鑰列、麥克風裝置與電平、完整對話紀錄。
- **全螢幕 demo**：只有球體和一行狀態文字；點球體開始或結束對話，按 Esc 回文字模式。

首字延遲＝學生停止說話（或按送出）到聽到第一個聲音。

## 注意

- 這個服務**沒有登入**。對外部署前要放在有存取控制的入口後面，否則任何打得開頁面的人都能用掉額度或覆寫金鑰。
- 花費是依 `pricing.json` 的單價在本機估算（2026-11-16 查價），實際金額以各家帳單為準。
- `data/`（用量紀錄）與 `secrets/` 不進版控。
