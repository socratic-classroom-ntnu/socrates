# Ken 的工作清單（B 包：課程、單人活動與底層）

## 11/14 起的順序（11/24 開放客戶）
11/14 調整，這一段排在下面所有段落前面：
1. **O6 最終確認**（**先做**，11/16 前完成；11/24 學生主流程一定要有，雷達、句子標記也在等它的最終統整）：依賴的 `final_summary` 已經在 develop。回顧階段 capped 的顯示照 #113 的討論，放進 F2 一起處理。
2. **免註冊完整功能**（O6 做完接著做，同樣 **11/16 完成**，11/24 要上）：前後端都由你做，包含下面「全部工作」的 3、3a、7、7a、7b（前端），細節以 Discord 的「免註冊加入（全端）」需求為準；這份的 PR 全部由 Fizzy 審。
3. 這一輪先不排：第 4（旗標與學生指標）、5（統整引用）項。第 6 項的「最終統整與確認迴圈」就是 O6；其中的雷達這一輪要做，但另開需求、由其他組員負責，你不用做。

已完成：O1–O5（#77、#83、#85、#127）、O7（#113）、content-authoring 與 readiness 的 response_model（#109、#84）。#110 等 Arthur 確認 stage／dev 的環境變數已改用新名稱再合。

## 你的第一個 PR
course-management 的敘述型活動：活動內容改成「敘述＋立場空間」，加 `POST`／`PUT /activities/{id}/expansion`，發布時把立場空間鎖進 ActivityRevision；用 migration 把舊的選項轉成立場空間。同一個 PR 改 `modules.json`（新增依賴 llm-runtime、ai-providers），請 Courecta 審。

## 優先：開放式對話（11/7 開契約 draft PR，11/13 完成）
來源：Fizzy 11-05 的需求「開放式對話」（Discord 他組需求區的討論串與附件 md），以及 Arthur 與 Fizzy 11-05 的協議。這一段排在下面「全部工作」的前面。

**兩種設計都要能跑**（Fizzy 13:27「我覺得可以照你的設計或者兩種都做」；要用開關切換還是分兩條分支，交給你決定，寫在 PR 說明）：
- **設計一：每位學生即時延伸**：老師給一個題目 → LLM 寫成起始情境 → 學生和蘇格拉底對話 → 階段確認 → LLM 依這位學生的立場與理由延伸或變形出下一個情境 → 重複 n 次 → 最終確認 → 結算。每位學生拿到的延伸情境不同。
- **設計二：立場空間**：下面「全部工作」的第 1、2 項（發布時拓展成立場空間、stance_classify 歸類），全班看到同一版，可以做「各立場有幾人」的統計。

| 順序 | 模組 | 做什麼 | 等誰 | 完成的樣子 |
|---|---|---|---|---|
| O1 | course-management | 出題只剩一個輸入框：老師寫的文字存成活動名稱與第一個題目的材料；拿掉 options 與多題；migration 0018（接在 0017 之後）把舊的選項與多題欄位拿掉，舊資料清掉、不寫相容 | — | 發布的活動沒有選項欄位 |
| O2 | solo-activity | 狀態機拿掉選項流程，學生用自己的話回答（打字或語音）；多題改成情境序列；每則訊息帶 scenario 屬性 | — | 狀態轉移測試先紅再綠 |
| O3 | solo-activity | 階段確認沿用現有的確認統整（不另做）；確認後呼叫 should_conclude，決定延伸下一個情境或進最終確認 | O4 | 「不太對」四個入口都回到對話 |
| O4 | llm-runtime（`policy.py`，另送一個 PR 給 Courecta 審） | should_conclude：輸入是結構化的觀察值與計數，不是 LLM 的文字；情境數的地板與上限寫成可調參數（先用 2、4），實測後再調；要不要收尾由規則決定，不由 LLM 決定 | Courecta 審 | 真值表測試先紅再綠 |
| O5 | solo-activity | 延伸情境：每一個都存下來（內容、依據的前文、模型），重新整理或重試時不換；產生失敗有後備做法，學生不會卡住 | Courecta 的情境生成與情境延伸 | 兩位學生回答不同時，拿到不同的延伸情境 |
| O6 | solo-activity | 最終確認：以各階段確認為材料，整理整個思路與脈絡 | Courecta 的 final_summary | 連續兩次「不太對」就標記「未確認」並結束 |
| O7 | solo-activity | 訊息上限：到上限就用目前的整理進確認，情境標成 capped；不會只剩一個必定失敗的動作 | Amethus（capped 的顯示文字） | 新測試先紅再綠 |
| O8 | solo-activity | 教師「即時狀況」「統計分析」的 view：已確認幾個情境、目前第幾個、目前狀態；analysis 多送 current_position | Amethus 審契約 | 重產型別後沒有 diff |
| F1 | 前端 authoring（`frontend/src/features/authoring/activity-form/`） | 出題表單只剩一個輸入框；拿掉選項與多題的欄位（含題目排序面板） | O1 | 表單送出的 body 沒有 options 與多題欄位，測試先紅再綠 |
| F2 | 前端 solo-activity（`frontend/src/features/solo-activity/`） | 學生對話頁拿掉選立場流程，改成自由回答（打字或語音沿用 `useSoloSpeechInput`）；時間軸顯示情境序列；階段確認、最終確認、capped 的畫面；按鈕只依後端的 `available_actions` 顯示 | O2、O3、O5、O6、O7 | 從第一個情境走到最終確認的頁面測試先紅再綠 |
| F3 | 前端 course（`frontend/src/features/course/teach/TeacherLivePage.tsx`） | 教師「即時狀況」顯示每位學生已確認幾個情境、目前第幾個、目前狀態 | O8 | 頁面測試用產生的型別，沒有手寫型別 |
| F4 | 前端 course（`frontend/src/features/course/teach/TeacherAnalysisPage.tsx`） | 教師「統計分析」顯示 current_position 與各情境的確認結果 | O8 | 頁面測試用產生的型別，沒有手寫型別 |

- 單人 prompt 只由 Courecta 改：你把需要的改動（拿掉選項、「表態」改成說出能被辨認的主張、延伸情境的規則）寫給他，由他合進去。
- 前端（出題表單、學生對話頁、教師兩頁）也由你做（Fizzy 11-05 的要求），就是上表 F1–F4；一樣是一項一個 PR 到 `backend/main`。畫面照現有元件與樣式延伸，新的視覺有疑問再問視覺設計團隊。
- 分組課這一輪不動、仍有選項：共用的 Observations、should_advance 的意思不變，分組課的測試要列入回歸。

## 11/19 新增：Claude Haiku 回覆格式（11/22 交，排在下一段「教師看學生完整對話」前面）
規格以 Discord「【問題回報】Claude Haiku 模型回覆格式」討論串為準。後台把 AI 設成 Claude Haiku 5.5（經 OpenRouter）時，學生還沒說理由，模型會把導師摘要的「理由摘要」寫成空字串；現在規定至少 1 個字，整個回覆被丟掉，學生的「我的對話」一直暫時無法回應。Anthropic 不保證遵守格式裡的字數、項數下限，老師用自己的 Anthropic 金鑰也會遇到，11/24 試用前要修好。格式放寬由 Courecta 做（他的第 11～13 項），這裡是單人活動與畫面的部分。開工前先等 `backend/main` 同步 `develop`（含 Fizzy 11/19 推的平台管理員與平台共用 AI 設定），再從同步後的 `backend/main` 開分支。分支照後端組流程，每項一個 PR 回 `backend/main`；兩人的項目都合進 `backend/main` 後，由 Arthur 打包成 `fix/haiku-response-format` PR 到 `develop`。

| 順序 | 模組 | 功能 | 做什麼 | 等誰 | 完成的樣子 |
|---|---|---|---|---|---|
| 12 | solo-activity | Haiku 回覆格式 | 學生被請去確認觀點前，導師摘要的「目前立場」「理由摘要」都要有字：任一欄是空字串就不進確認、繼續對話（`should_advance` 為真也一樣）；訊息額度用完（capped）照舊送確認，空的欄位原樣存空字串 | Courecta 11 | 新測試先紅再綠：一欄空 → 不進確認；capped 且兩欄都空 → 仍進確認 |
| 13 | 前端 solo-activity | Haiku 回覆格式 | 確認觀點畫面（含 capped）遇到空的「目前立場」「理由摘要」，顯示灰字「（還沒說明）」；教師即時狀況、統計分析顯示這兩欄的地方一樣處理 | 12 | 頁面測試先紅再綠；最後在 dev 站用平台共用 AI 設定把模型設成 Claude Haiku 5.5（經 OpenRouter），實際走完一次「我的對話」到確認觀點，截圖與稽核紀錄貼回討論串 |

## 11/19 新增：教師看學生完整對話（11/22 交）
規格以 Discord「【需求】教師看學生完整對話」討論串的附件與 Figma「教師看完整對話」為準（Fizzy 11/19 提出）。分支照後端組流程：從 `backend/main` 開 `backend/<你的名字>/...`，每項一個 PR 回 `backend/main`；四項都合進 `backend/main` 後，由 Arthur 打包成 `feature/teacher-transcript` PR 到 `develop`。學生端畫面與學生自己的 API 一律不改。

| 順序 | 模組 | 功能 | 做什麼 | 等誰 | 完成的樣子 |
|---|---|---|---|---|---|
| 8 | solo-activity | 教師看完整對話 | 學生按「不太對」時記下時間：存在該情境的進度裡，每按一次記一筆、不覆蓋 | — | 連按兩次「不太對」記下兩個時間；學生端回應裡沒有這個欄位 |
| 9 | solo-activity、course-management | 教師看完整對話 | 新增老師讀取 API：課程擁有者用報名紀錄讀某位學生在某個活動的完整對話。回傳依序的訊息（角色、原文、所屬情境、時間）、每個情境確認過的立場與該情境第一則訊息的位置（點軌跡跳過去用）、第 8 項的「不太對」時間、狀態（用詞與即時狀況同一組）。可以只取某則之後的新訊息，給前端每 10 秒更新用。老師模型內部的觀察欄位不回傳 | 8；Amethus 審契約 | 非擁有者一律 404；還沒開始的學生回「尚未開始」；重產型別後沒有 diff |
| 10 | 前端 course（`TeacherLivePage.tsx`） | 教師看完整對話 | 即時狀況加「檢視」欄（眼睛），點進完整對話頁；頁尾改新文案；照 Figma | 9 | 頁面測試先紅再綠 |
| 11 | 前端 course（新頁「完整對話」） | 教師看完整對話 | 左邊聊天室（聊天軟體樣式）、右邊立場軌跡，點軌跡跳到該情境開頭；每 10 秒更新，老師往上翻時不被拉回底部，改顯示「有 N 則新內容」；Figma 03–12 的狀態都做到；顏色用學生對話頁已有的，先加進 `tokens.css` 再引用，不寫死色碼、不用紅色 | 9、10 | 瀏覽器走一遍：即時狀況 → 檢視 → 完整對話 → 回到即時狀況，各狀態對照 Figma；前後端測試、lint、typecheck、contract 檢查全綠 |

## 全部工作（照順序做；「—」是不綁新功能的現有待辦，有空檔就做）
| 順序 | 模組 | 功能 | 做什麼 | 等誰 | 完成的樣子 |
|---|---|---|---|---|---|
| 1 | course-management | 敘述型活動 | 上面的第一個 PR | Courecta 的 ActivityExpansion | 發布後改敘述，不影響已開始的作答 |
| 2 | solo-activity | 敘述型活動、多語 | 拿掉選項流程，改成自由文字表態，再用 stance_classify 歸類；「我其實改變想法了」＝重新歸類，舊立場留在紀錄；每則訊息存 locale | Courecta 的 StanceClassification、SoloTutorTurn | 學生用英文作答時，逐字稿保留原文 |
| 3 | course-management | 免註冊加入 | 課程設定加「允許免註冊」，預設開（含既有課程）；QR 連結；訪客可以選課；`GET /course-join/{code}` 與活動 QR 的預覽（`GET /activities/{id}/join-preview`）都回 `allow_guest`；訪客從活動 QR 進來同時加入那門課，建立訪客與加入課程在同一個交易，失敗時不留下訪客；老師關掉後只擋新加入，已加入的訪客照常參與；沒開時回 `GUEST_JOIN_DISABLED`（這個 code 在同一個 PR 加進 `REASON_CODES` 與前端文字，`EXPANSION_LOCKED`、`RADAR_NOT_READY` 也照這樣在第 1、6 項的 PR 加） | Courecta 的訪客帳號 migration（4、4a） | 訪客從掃碼到開始對話不需要 email；從活動 QR 進來的訪客同時出現在課程名單 |
| 3a | course-management、solo-activity | 免註冊加入 | （11/14 縮小：學生名單這一輪不做）即時狀況（solo-activity progress）與統計分析的回應加 `kind`（`registered`／`guest`／`expired_guest`）；過期以 `guest_expires_at` 為準，已過期的名字顯示「匿名訪客 N」，同一門課只在已過期的訪客之間依加入順序（選課時間）編號，查詢時算、不另外存，換排序也不變編號；按註冊就轉正，所以還沒驗證 Email 的人顯示成正式學生 | Courecta 4a | 即時狀況與統計分析回 `kind`；兩位過期訪客依加入順序顯示「匿名訪客 1」「匿名訪客 2」，改排序後編號不變；重產型別後沒有 diff |
| 4 | solo-activity | 旗標與學生指標 | 每則訊息存 flags；指標寫成一個純函式檔；`GET /solo/activities/{id}/progress` 帶出指標、趨勢、標記，並即時更新 | Courecta 的 flags | 危險傾向或惡意離題＝1 時，教師 progress 回該學生的標記；學生端回應裡沒有 flags |
| 5 | solo-activity | 統整引用 | 存放引用（新表 summary_sources），view 回傳 message id 與 quote 的起訖位置 | Courecta 的引用驗證；Amethus 的引用型別 | 每個 quote 都是該學生原句的子字串 |
| 6 | solo-activity | 統整與雷達 | 最終統整與確認迴圈，取代 submit_review：連續兩次「不太對」就標記「未確認」並結束。學生 ≥15 人走 PCA＋百分位，<15 人走 LLM 維度；`GET /solo/activities/{id}/radar`、改軸名的 PATCH | Courecta 的 `embed()`、final_summary、radar_*；Amethus 的雷達契約 | 兩條路回同一個契約 |
| 7 | app-shell | 免註冊加入 | 註冊 Courecta 提供的到期訪客清名字排程（每日一次），並把各模組的訪客紀錄 hook 註冊進去 | Courecta 5、5b | 少註冊一個 hook 時啟動就報錯；加入滿 168 小時的訪客，下一次排程後名字已清空、標成已過期，作答與對話都還在 |
| 7a | course-management、solo-activity | 免註冊加入 | 實作訪客紀錄 hook：選課與單人作答（含訊息）的 `reassign`，以及清掉這兩個模組存的訪客名字（選課的課內名字等），紀錄本身不動；同一課／同一活動兩邊都有時留帳號那份、訪客那份刪掉 | Courecta 5、5b 的契約 | 每個衝突情境各一條測試；到期後名字清掉、作答還在、老師統計照算 |
| 7b | 前端 | 免註冊加入 | 照 Figma「免註冊加入」頁：掃課程或活動 QR 後選免註冊加入、填暱稱與語言；訪客使用中的帳號選單與受限功能的邀請；保留紀錄 → 註冊升級或登入併入；老師端的「允許免註冊」開關與名單上的訪客標示。訪客過期（`GUEST_EXPIRED`）和沒登入一樣導到登入頁，不另做說明頁 | 3、3a；Courecta 5a | 頁面測試先紅再綠；電腦與手機都照設計稿 |
| — | content-authoring | 現有待辦 | 5 個端點補 response_model（清單在 `RESPONSE_MODEL_PENDING`） | Amethus 審 | 重產型別後沒有 diff |
| — | platform | 現有待辦 | 相容帳冊（`COMPATIBILITY-LEDGER.md`）裡的舊環境變數別名 | — | — |
| — | app-shell | 現有待辦 | `GET /api/v2/readiness` 補 response_model | Amethus 審 | 重產型別後沒有 diff |

## 注意
- 學生確認最後一題後按「送出回顧」，目前作答直接進入 `completed`，這是過渡做法，第 6 項會取代它。
- 舊單人對話的資料表已經搬到 `legacy_solo_dialogue` schema（migration 0017，issue #71）。要不要把舊資料帶進單人活動，等決定後再排，現在不用動。
- migration 順序：Courecta 的 identity-access → 你的 course-management → 你的 solo-activity，每個 down_revision 接前一個。
- migration 編號（11/14）：develop 已到 0020。你的「允許免註冊」（course-management）先做，用 0021、接 0020；「學生／老師角色」的 `account_role` 之後接在你後面。
- 訪客的 `username` 是「暱稱-8 碼亂數」，加入課程時 `default_display_name` 直接用它，老師會看到亂碼；預設課內名字要是暱稱本身。
- `errorText` 的 `GUEST_EXPIRED`「請重新掃描課程 QR code 加入」容易讓人以為能接回原本的對話；過期的訪客重新掃碼會是全新的訪客，舊紀錄只留給老師看，文字要改。

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
