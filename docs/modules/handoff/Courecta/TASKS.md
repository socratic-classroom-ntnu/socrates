# Courecta 的工作清單（C 包：帳號與 AI）

## 11/14 調整（11/24 開放客戶）
- 已完成：第一個 PR 與 1（#74、#75）、2、3（#122、#123、#133）、4（#124）、4a（#136）、5＋5b（#125）、7（#130）、兩組 response_model（#128、#129）、program key（#126）；開放式對話 O1–O3。
- **接著做 5a**（登入時併入訪客紀錄，11/24 要上）：只依賴 #125 的 hook 契約，不用等 Ken 的 7a，先用假的 hook 寫測試（像 #125 那樣），Ken 的 7a 合進來後再接起來跑一次。兩件事先跟 Ken 對好：登入回應加一個「有沒有併入」的欄位（前端靠它顯示併入完成）；「學生／老師角色」的 `account_role` 合進去後，老師帳號拒絕併入，回一個錯誤碼（前端顯示「老師帳號無法併入」）。Ken 做免註冊時發現帳號模組的問題，也由你修。他這份的 PR（含帳號模組的部分）由 Fizzy 審。
- 雷達這一輪要做：6（embedding）照原本的規格繼續（#142 已開）。8（TTS）這一輪先不排，語音模式下一輪。

## 你的第一個 PR
在 `llm_runtime/contracts.py` 定義 7 個新 schema 的型別：SoloTutorTurn（含 10 個 flags）、ActivityExpansion、StanceClassification、FinalSummary、RadarAxisNames、RadarDimensions、RadarScores。每個 schema 附一個合格、一個不合格的測試樣本。這個 PR 只放型別，不放 prompt；Ken 會等這份型別才開始接，請最先做。

## 優先：開放式對話（配合 Ken，11/7 契約、11/13 完成）
| 順序 | 模組 | 做什麼 | 完成的樣子 |
|---|---|---|---|
| O1 | llm-runtime | 新角色情境延伸的 schema 與 program：依學生到目前為止的立場與理由，只改一個條件並明講改了哪裡（第一個情境是老師原文、不經 LLM，所以沒有情境生成）；走 `guarded_generate`，加進鐵則路由 ROUTER.json 與 test_iron_rules 的呼叫點 | Ken 可以 import 型別；鐵則測試全綠 |
| O2 | llm-runtime | 單人 prompt 你是唯一修改者：把 Ken 交來的改動合進去（拿掉選項、「表態」＝說出能被辨認的主張、延伸規則）；final_summary 改成以各階段確認為材料 | test_solo_outputs_match_prompt、test_solo_tutor_program 全綠 |
| O3 | llm-runtime | 審 Ken 送來的 `policy.py` should_conclude PR：輸入是結構化觀察值與計數，地板與上限是可調參數 | 真值表測試先紅再綠 |

## 全部工作（照順序做；「—」是不綁新功能的現有待辦，有空檔就做）
| 順序 | 模組 | 功能 | 做什麼 | 等誰 | 完成的樣子 |
|---|---|---|---|---|---|
| 1 | llm-runtime | prompt 設計 | 上面的第一個 PR，接著在 programs.json 新增或改寫對應的 program | — | Ken 可以 import 型別；schema 單元測試通過 |
| 2 | llm-runtime | prompt 設計、多語 | 鐵則 L1 加「回覆語言＝output_locale」；新增 6 份 L2；solo_tutor 的 L2 加 flags 定義、拉回規則、不提 flag | — | 鐵則測試涵蓋每一條 |
| 3 | llm-runtime | 多語、統整引用 | 語言檢查與引用驗證（message_ref 屬於該學生、quote 是原文子字串）接進 `guarded_generate`，不合格就重試一次；驗證通過後把 `message_ref` 換成 `message_id` 並算出起訖位置，交給 Ken 存放（對外型別由 Amethus 定） | — | 第二次仍不合格回 typed error |
| 4 | identity-access | 免註冊加入 | migration：帳號加 `kind`、`guest_expires_at`，email／password_hash 可為空；`POST /auth/guest`、`POST /auth/guest/upgrade`；`GET /auth/me` 加 `kind`；訪客只靠裝置上的 session cookie 定位，每次有動作就把 `guest_expires_at` 延到 7 天後；訪客加入時選語言（期限與註冊欄位由 4a 修改） | Amethus 審 | 7 天內註冊的訪客，帳號 id 不變、紀錄都在 |
| 4a | identity-access | 免註冊加入 | 第 4 項（#124）已經送審，這項是新規則要改的部分：`guest_expires_at` 固定成成為訪客那一刻 + 168 小時，有動作不延長（拿掉每個請求都延到 7 天後；存時間戳，不另外處理時區或「到期日當天」）；帳號要能表示已過期，`kind` 回 `registered`／`guest`／`expired_guest` 三種（migration 一起改）；`POST /auth/guest/upgrade` 加收使用者名稱，規則同一般註冊（維持現有的 `USERNAME_PATTERN` 與密碼規則，不放寬），一律是學生；按註冊就轉正：`kind` 改成 `registered`、清掉 `guest_expires_at`，之後照一般註冊要驗證 Email；Email 已註冊回 `EMAIL_TAKEN`、使用者名稱被用掉回 `USERNAME_TAKEN`（沿用一般註冊的檢查）；訪客名字長度照 Figma 改成 1–40 字（#124 是 24）；訪客登出只讓 session 失效，不改到期日、不清名字（名字照到期時間由 5b 的排程清） | Courecta 4（#124）；Amethus 審 | 加入第 3 天有動作，到期時間不變；upgrade 帶已註冊的 Email 回 `EMAIL_TAKEN`、帶已被用掉的使用者名稱回 `USERNAME_TAKEN`；upgrade 後還沒驗證的帳號不會被到期排程清掉；到期的訪客 `kind` 是 `expired_guest`；40 字的訪客名字可以加入、41 字回 422；訪客登出後同一個 cookie 被拒，但名字到到期時才清 |
| 5 | identity-access | 免註冊加入 | 訪客紀錄 hook 的契約：每個存學生紀錄的模組提供 `reassign(guest_id, account_id)` 與 `delete(guest_id)`；`reassign` 遇到同一課／同一活動兩邊都有時，以帳號那份為準、訪客那份留在訪客帳號。再提供刪除閒置訪客的排程工作：`guest_expires_at` 已過的訪客，先呼叫各模組 `delete` 再刪帳號（Ken 在 app-shell 註冊；platform 不能依賴業務模組）（清名字與衝突規則由 5b 修改） | — | 閒置第 8 天的訪客帳號與紀錄都刪掉；期間註冊的帳號不受影響 |
| 5a | identity-access | 免註冊加入 | 登入時併入訪客紀錄：登入當下裝置上有訪客 cookie，就呼叫各模組的 `reassign`（這一輪是選課與單人作答；分組課不開放訪客），之後 session 換成登入的帳號；同一課／同一活動兩邊都有時留帳號那份，訪客那份在併入時刪掉；併入後課內名字不變；老師帳號不能併入等 `account_role` 合進去後補上（見上方 11/14 調整）。註冊升級沿用同一個 id，不走這條 | 5b（#125 已合）；Ken 7a 合進來後接起來再測一次 | 帶訪客 cookie 登入後，訪客的選課與單人作答都出現在帳號下；兩邊都有同一活動的作答時，併入後只剩帳號那份 |
| 5b | identity-access | 免註冊加入 | 第 5 項（#125）已經送審，這項是新規則要改的部分：hook 契約的 `delete(guest_id)` 改成「清掉這個模組存的訪客名字」，建議改名（例如 `forget_name`）；`reassign` 不變，但衝突時留帳號那份、訪客那份刪掉（#125 現在是留在訪客帳號）；這一輪只有存訪客紀錄的 course-management、solo-activity 要提供 hook，分組課這一輪不開放訪客，不需要；排程從「刪紀錄、刪帳號」改成「`guest_expires_at` 已過的訪客：呼叫各模組清名字、清訪客帳號的名字、session 失效、標成已過期」，帳號那一列保留；名字直接清，不軟刪 | Courecta 5（#125）、4a | 加入滿 168 小時後的排程：名字都清空、session 失效、作答與對話還在、老師統計照算；期間註冊的帳號不受影響 |
| 6 | ai-providers | 雷達 | 本地 embedding provider：`embed(texts) -> list[list[float]]`，預設 multilingual-e5-small、CPU 執行，模型檔隨 backend 映像附上 | — | 單 pod 實測延遲與記憶體寫進模組文件（參考：1 核 p50 約 279 ms、4 核約 101 ms，約 1.2 GB） |
| 7 | llm-runtime | 評測 | `tests/evals/`：30 則固定題組（每則標好期望的 flags 與 move），可以手動對 OpenAI、Anthropic、Gemini 各跑一次並出報表 | — | 報表含 schema 合格率、flag 一致率、拉回遵守率、語言正確率、引用有效率；不擋合併 |
| 8 | llm-runtime | 語音 | `POST /speech/tts`：文字→音訊＋字時間點 | Amethus 的 TTS 契約 | 前端 media 能播放；老師講話時用 VAD 偵測到學生開口就停掉 TTS |
| — | identity-access | 現有待辦 | 7 個端點補 response_model（清單在 `RESPONSE_MODEL_PENDING`） | Amethus 審 | 重產型別後沒有 diff |
| — | ai-providers | 現有待辦 | 10 個端點補 response_model（同上清單） | Amethus 審 | 重產型別後沒有 diff |
| — | llm-runtime | 現有待辦 | `prompts.compile_program` 的 key 算了兩次，第一次的結果被覆蓋 | — | 只算一次 |

## 注意
- 安全類訊息已定案：不做固定關心句。離題、惡意離題、危險傾向一律用蘇格拉底式提問拉回，同時標旗標給老師看（PROMPT-DESIGN 第 3 節）。
- 學生的單人活動用老師的金鑰（`resolve_owner_chain`）。
- 你這包不 import Ken、Hsy 的模組：他們呼叫你，不是你呼叫他們。

## 規則（repo 現行檢查會擋）
- 只 import 其他模組的 contracts／service／repositories；route 不互相引用，也不動態 import。`python scripts/check_modules.py` 的違規數只能變少。
- 回應一律要有 response_model。新增端點時同一個 PR 更新 `app/modules/contract/contracts.py`，並重產型別（`python scripts/gen_classroom_types.py`），重產後沒有 diff。
- 一個 PR 只動一個模組。改到別包的檔案時，照檔案所屬的模組分開送 PR，給那一包的負責人審。

## 送 PR 前的檢查
在 repo 根目錄依序跑，全部通過再送：
```bash
cd backend && ruff check . && ruff format --check . && python tools/mypy_check.py && pytest -q
cd .. && python scripts/check_modules.py && bash scripts/check_naming.sh
python scripts/gen_classroom_types.py && git diff --exit-code frontend/classroom-openapi.json frontend/src/contract/classroomTypes.ts
```
