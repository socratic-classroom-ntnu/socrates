# Socrates 教室（Classroom）— 架構與已定決策

相關文件：[劇本／題目 JSON 結構](classroom/SCRIPT-SCHEMA.md)、[LLM 結構化輸出](classroom/LLM-OUTPUT-SCHEMA.md)、
[課堂與分組課堂的狀態轉移](classroom/STATE-MACHINE.md)。

## 可見產品

註冊／Email驗證／登入→Teacher或Student模式→一次性Classroom→3-2-1→限時作答
→5秒選項分布→共享3D Tutor舞台→各立場代表深聊→逐題與全課總結→Zen卡片。

每帳號有雙能力；creator可再加入Student membership。班級開始時snapshot已儲存Draft，
保持教師出題文字、version與實際generated question provenance；snapshot 時每題會補上一個
`__other__`（其他）選項。teacher短暫離線由server時間繼續。

## 責任分層

React元件→集中HTTP commands／WS events→FastAPI DTO layer→application service
→GameOrchestrator／policy純逻辑→transaction＋`modules/platform/repositories/classroom_storage.py` 的持久化函式→PostgreSQL。

LLM jobs為typed intent；worker在transaction後消費，`prompts.compile_program` 從repo templates
（`prompts/classroom/programs.json`）／skills（`skills/classroom/`）與DB metadata組裝要求，再交給
`modules/llm_runtime/tutor/classroom_gateway.generate`。Provider沒有branch、classroom mutation或shell權限。
Tutor observations由policy判定；phase、selection與deadline由server決定。

**Provider 鏈：** 每次呼叫依教室擁有者帳號解析 provider profile——先用預設 profile，失敗再試
fallback profile，都不可用時以固定內容完成（見「Teacher自動化與LLM」）。adapter 有 `openrouter`、
`openai`、`anthropic`、`gemini`、`openai-compatible`。自架端點的主機須在
`SOCRATES_PROVIDER_LOCAL_ALLOWLIST` 內（stage 環境不適用）。profile 的憑證以 `DATABASE_URL`
字串衍生的金鑰加密，該字串一變就解不開（`provider_profiles.py`）。

GameRun目前以ClassroomRun aggregate內的global state表示，QuestionRun另有durable rows與read projections。
這保留global/question-local的分層，並以每班一個row-lock配置唯一phase mutation owner。

## 教室功能模組

以下掛在 `/api/v2` 之下；`modules/group_dialogue/domain/group_run.py` 與 `modules/group_dialogue/services/ai_students.py` 以 `extend()` 包裝
`GameOrchestrator`（`modules/classroom_core/orchestrator/classroom.py`）。路徑皆相對於 `backend/app/`。

| 模組 | 路由 | 內容 |
|---|---|---|
| `modules/content_authoring/api/routes/classroom_library.py` | `/library/*` | 教室庫、教室資產與 session |
| `modules/group_dialogue/api/routes/groups.py`／`modules/group_dialogue/domain/group_run.py` | `/groups/*` | 分組課堂（group runs） |
| `modules/group_dialogue/api/routes/ai_students.py`／`modules/group_dialogue/services/ai_students.py` | `/groups/classrooms/{rid}/ai-students*`、`/suggestions/other` | AI 學生、「其他」選項的建議 |
| `modules/ai_providers/api/routes/provider_profiles.py` | `/provider-profiles*`、`/ai-settings/account`、`/library/classrooms/{cid}/ai-settings` | 帳號 provider profile 與 AI 設定 |
| `modules/platform/api/routes/public_config.py` | `/public-config` | 研究側欄的搜尋設定（`SOCRATES_GOOGLE_CSE_ID`／`SCOPE`） |
| `modules/classroom_core/api/routes/script_assist.py` | `/scripts/assist`、`/scripts/samples` | AI 協助出題：用帳號 `ai_script_authoring` 角色的模型產生一題草稿，教師套用到編輯中的劇本後仍要自己存檔；範例題目取自 ladder 檔（`LADDER_PATH`） |
| `modules/classroom_core/services/scenario_ai.py` | — | 題目的 `scenario_ai`（只給教師看的連線與模型）：檢查屬於擁有者，並讓該題的 `focused_tutor`、`personal_tutor` 與 `question_summary` 改用它；學生畫面與 LLM 內容只看到 `PublicQuestion` |
| `modules/classroom_core/api/routes/question_bank.py` | `/bank/questions*` | 題庫：發布自己劇本裡的一題、搜尋、預覽、下架、匯入到自己的劇本（資料表 `bank_questions`，migration `0011`） |

## 資料與並發

Accounts、opaque login sessions、one-use email/reset tokens、mail outbox 與 delivery（`mail_delivery`）、
rate buckets（`rate_buckets`）。
Scripts、Script snapshots、ClassroomRun、Membership、QuestionRuns、Answers、Events、ActionReceipts。
LLM jobs／lease、budget、program metadata、call audit、point ledger。
Portal 擴充：provider profiles 與 session 憑證、帳號 AI 設定（`provider_profiles`、`session_provider_secrets`、`account_ai_settings`）、AI 學生（`ai_students`）、
教室庫資產／session／receipts（`classroom_assets`、`classroom_sessions`、`library_receipts`）。

Answers唯一鍵 `(question_run_id,membership_id)`；命令冪等 `(room_id,actor_id,action_id)`。
Role是room membership，client只選呈現mode。教師授權來自creator account。
100ms grace收完後Server以latest autosaved draft finalize，明確submission保持完成狀態。

Event唯一鍵 `(room_id,seq)`（`room_id` 指向 `classroom_runs`）；資料與NOTIFY同transaction，
durable event 的 NOTIFY 只帶 `{room, event_id, seq}`。
每worker專用LISTEN＋read durable rows＋broadcast自己的WS；重連snapshot／last_seq replay。
`tutor.delta` 是不落地的 ephemeral event，經 `pg_notify` 帶文字片段（每段最多 1000 字）同步到各 worker；
目前 provider 回覆完成後才整段送出一次，沒有逐 token 串流。導師回覆以 `tutor.final` event
與 focus state 內的 messages 持久化。進行中worker重啟時由durable job lease重建；
已完成messages與phase保留，前端以新generation/reconnect snapshot恢復。

## Teacher自動化與LLM

Focused selection依立場、有argument、online、較少被挑次數，平手隨機。
每題default3次student→tutor來回；觀察達成／上限／TeacherNext後micro-summary。
TeacherNext遇目前生成时等該次生成收尾。零人／零合資格代表的option跳過選人。

Dynamic：representatives結束→多數立場與代表argument→生成題目＋options→8秒preview→AUTO_ACCEPT。
**preview 逾時自動採用是刻意的設計**（2026-10-03 確認）：教師可在 preview 期間採用或重新生成，
不動作則照常進行。預設dynamic總題數3，可於Script Builder設定；這是版本化配置。

**沒有可用的 LLM 或額度用完時，所有 job 都會完成**，不會停在 pending，audit 記錄
`fallback_used=true` 與原因：focused tutor **暫停回應**——不產生導師訊息、focus 狀態設為 `TUTOR_UNAVAILABLE`、
`last_error` 依原因顯示提示（group view 以 `focus_notice` 提供），不因逾時自動結束，等老師的 `next`（劇本的 `probe_hints`
只給模型參考，不會被當成導師台詞）；dynamic 產生一題固定的
「換一個條件，你的選擇會改變嗎？」；題目／班級／個人總結為固定說明文字；AI 學生為固定發言。

Job priority：`llm_student_turn`(0) > focused tutor／personal tutor(1) > dynamic(2) > question summary(3)
> class summary(4) > personal summary(5)。

額度依序檢查（`modules/llm_runtime/services/llm_workers.py` 的 `reserve_call`）：班級呼叫次數上限 → 班級 token 上限（預設 1M）
→ 選填的成本上限 → 平台每日 `CLASSROOM_LLM_DAILY_BUDGET`。班級呼叫次數上限取劇本的
`live_llm_call_budget`（教師額度，預設 240；0 表示不使用 live LLM）與帳號路由 `max_calls`（預設 240，0 視為未設定）
的較小者（`effective_call_limit`）；AI 學生另有 `CLASSROOM_AI_CALL_BUDGET`（預設 240）的保底。（舊名 `RUN2_*`／`PORTAL_AI_*` 仍可讀，下一版移除。）

Templates＋SkillSet＋Prompt metadata 保存 version 與 hash；每次呼叫的 audit 記錄 provider、
provider profile、classroom owner、requested／actual model、use case、latency、token usage、
estimated cost、fallback 與原因。`skills/classroom/socratic.md` 會加到全部 7 個 program 的 system prompt
（包含 AI 學生），改它會改變 `skill_hash` 與模型行為。
Question summary完成後cache；class從逐題summary合成；personal依全課／單題scope按首次開啟cache。
Full account與互動record存backend；學生summary只投影統計與自己的分析，Email保留account層。

## 分組課堂的個人對話

只用於分組課堂（group run，非 individual 模式）；全班課堂沒有這一段。目的：每位學生在進入多人階段前，
都先與 AI 個別對話、釐清並確認自己的立場（QA：原本學生可以不經任何 AI 追問就確認觀點）。

- **階段**：`answering` 中學生的作答一被接受（`answer`，或截止時 `finalize` 收下草稿），就開始他自己的
  `personal_tutor` 對話，作答時間內即可進行。作答結束時若仍有真人學生的對話未有結果，進入 `personal`
  階段（計時為題目的 `personal_seconds`）；全員有結果、教師 `next` 或計時到期即關閉，進入 `distribution`。
  關閉時尚未有結果者標為 `incomplete`（`end_reason`：`all_settled`／`teacher_next`／`deadline`）。
- **狀態**（`run["personal"][member_id].status`）：`probing`（AI 生成中或等學生回覆）→ `awaiting_confirm`
  （有候選摘要與 `summary_digest`）→ `confirmed`（存成 `baseline`）；另有 `unclear`（學生選暫時無法釐清）、
  `capped`（達 `max_personal_turns` 仍未符合判準）、`unavailable`（LLM 無法使用，學生訊息已保存，可重試）、
  `incomplete`。`unclear`／`capped`／`incomplete` 不產生基準。AI 學生不經對話，作答即為基準（`source: "ai_student"`）。
- **指令**（`POST /groups/runs/{id}/commands`）：`personal_message`、`personal_confirm`（需帶目前的
  `summary_digest`）、`personal_revise`、`personal_unclear`、`personal_retry`；教師可帶 `data.member_id`
  送 `personal_retry`。對話關閉後一律回 `PERSONAL_WINDOW_CLOSED`。
- **結束判準只有一個**：`orchestrator/policy.py` 的 `should_advance`（經 `classroom_policy.stage_goal`），
  判準先於上限；`completed_turns >= 1` 的地板保證學生至少回應過一次追問才可能進入 `awaiting_confirm`。
- **欄位**：`Question.max_personal_turns`（預設 6，1–20）與 `Question.personal_seconds`（預設 600，≥30）。
  規格候選值待 P03 決定，目前預設 6 回合／600 秒，老師可依題目調整。
- **可見性**：學生的分組檢視只有自己的 `personal`；教師看到 `personal_progress`（各狀態人數與
  `not_answered`）與 `personal_overview`（狀態、候選摘要、基準，不含對話原文），母課堂的組別卡片也有
  `personal_progress`。`personal_tutor` 的串流片段不送到教室頻道（`llm_workers.PRIVATE_JOB_KINDS`）；
  沒有可用 LLM 時結果為 `tutor_unavailable`，不會自動完成。
- **分布與代表**：只採已確認的基準（`baseline_answers`，`distribution_basis: "personal_baseline"`），
  沒有基準的作答者人數記在 `distribution_excluded`。
- **教師端立場分佈（issue #15）**：`group_analysis.stance_distribution` 以同一套基準計算每題每組的
  選項人數與比例（`options[].count／percent`）、已確認與未確認人數、未確認者依個人對話狀態的分項
  （`unconfirmed_by_status`，含 `not_answered`），以及是否有兩個以上選項被持有（`differing`）。母課堂教師
  檢視的組別卡片帶目前題目的 `stance`，`/groups/classrooms/{id}/analysis` 的每組帶全部題目的 `stances`；
  學生檢視不含這些欄位。LLM 摘要延後。
- **可用動作**：分組學生檢視的 `available_actions` 由後端 `group_run.student_actions` 計算（含
  `group_statement`、`group_ack` 與上述個人指令），前端只依它顯示按鈕。

## 互動經濟與未來scope

愛心／點讚／禮物保存event，sender1 receiver5，script per-turn cap限制可得分。
參與型與social achievements在本期；shop／cosmetics與late join留到下一期；TTS／viseme由Portal接續。

## 部署

Stage為frontend Nginx與backend兩個應用容器，外部Postgres、郵件（預設 Resend API，SMTP 選用）、host Tunnel。
backend 由 `WEB_CONCURRENCY`（預設 2）個 uvicorn process 組成，每個 process 跑 `CLASSROOM_LLM_WORKERS`
（預設 4）個 LLM loop，以及 clock、mail、LISTEN、sweep 各一個 loop。
2×60負載在獨立CI資料庫（`scripts/classroom_load.py`）；部署後的 `deploy/stage/smoke.sh` 檢查首頁、readiness、
auth 路由與版本資訊，完整的教師／學生流程依 `deploy/stage/README.md` 第 4 節人工驗收。
Latency數值為實測目標，依receipt回讀。
