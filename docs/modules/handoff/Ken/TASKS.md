# Ken 的工作清單（B 包：課程、單人活動與底層）

## 11/14 起的順序（11/24 開放客戶）
11/14 調整，這一段排在下面所有段落前面：
1. **免註冊完整功能**（**11/16 完成**，11/24 要上）：前後端都由你做，包含下面「全部工作」的 3、3a、7、7a、7b（前端），細節以 Discord 的「免註冊加入（全端）」需求為準；這份的 PR 全部由 Fizzy 審。
2. **O6 最終確認**（免註冊做完接著做，11/24 學生主流程一定要有）：依賴的 `final_summary` 已經在 develop。回顧階段 capped 的顯示照 #113 的討論，放進 F2 一起處理。#125 的訪客紀錄 hook 契約與到期排程已經合進 `backend/main`；登入時併入訪客紀錄（Courecta 5a）由 Courecta 同時進行，會呼叫你 7a 的 `reassign`。詳細需求另開討論串。
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
