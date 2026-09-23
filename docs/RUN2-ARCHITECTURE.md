# Socrates Run2 — Classroom 架構與已定決策

## 可見產品

註冊／Email驗證／登入→Teacher或Student模式→一次性Classroom→3-2-1→限時作答
→5秒選項分布→共享3D Tutor舞台→各立場代表深聊→逐題與全課總結→Zen卡片。

每帳號有雙能力；creator可再加入Student membership。班級開始時snapshot已儲存Draft，
保持教師出題文字、version與實際generated question provenance。teacher短暫離線由server時間繼續。

## 責任分層

React元件→集中HTTP commands／WS events→FastAPI DTO layer→application service
→GameOrchestrator／policy純逻辑→transaction＋Repository→PostgreSQL。

LLM jobs為typed intent；worker在transaction後消費，PromptCompiler從repo templates/skills與DB metadata
組裝要求，OpenRouterProvider只有`openrouter/free`。Provider沒有branch、classroom mutation或shell權限。
Tutor observations由policy判定；phase、selection與deadline由server決定。

GameRun目前以ClassroomRun aggregate內的global state表示，QuestionRun另有durable rows與read projections。
這保留global/question-local的分層，並以每班一個row-lock配置唯一phase mutation owner。

## 資料與並發

Accounts、opaque login sessions、one-use email/reset tokens、mail outbox。
Scripts、Script snapshots、ClassroomRun、Membership、QuestionRuns、Answers、Events、ActionReceipts。
LLM jobs／lease、budget、program metadata、call audit、point ledger。

Answers唯一鍵 `(question_run_id,membership_id)`；命令冪等 `(room_id,actor_id,action_id)`。
Role是room membership，client只選呈現mode。教師授權來自creator account。
100ms grace收完後Server以latest autosaved draft finalize，明確submission保持完成狀態。

Event唯一鍵 `(classroom_run_id,seq)`；資料與NOTIFY同transaction，NOTIFY只傳event id。
每worker專用LISTEN＋read durable rows＋broadcast自己的WS；重連snapshot／last_seq replay。
`tutor.delta`在記憶體同步，`TutorMessage`完成後持久化。進行中worker重啟時由durable job lease重建；
已完成messages與phase保留，前端以新generation/reconnect snapshot恢復。

## Teacher自動化與LLM

Focused selection依立場、有argument、online、較少被挑次數，平手隨機。
每題default3次student→tutor來回；觀察達成／上限／TeacherNext後micro-summary。
TeacherNext遇目前生成时等該次生成收尾。零人／零合資格代表的option跳過選人。

Dynamic：representatives結束→多數立場與代表argument→生成題目＋options→8秒preview→AUTO_ACCEPT。
預設dynamic總題數3，可於Script Builder設定；這是版本化配置。
Focused模型等候採probe_hints；dynamic與summary保留pending並等待模型／budget。
Priority：focus>dynamic>question>class>personal。平台每日與classroom總額度分層。

Templates＋SkillSet＋Prompt metadata全部保存version、hash、actual model、request id、latency、tokens、fallback。
Question summary完成後cache；class從逐題summary合成；personal依全課／單題scope按首次開啟cache。
Full account與互動record存backend；學生summary只投影統計與自己的分析，Email保留account層。

## 互動經濟與未來scope

愛心／點讚／禮物保存event，sender1 receiver5，script per-turn cap限制可得分。
參與型與social achievements在Run2；shop／cosmetics與late join是Run3；TTS／viseme由Portal接續。

## 部署

Stage為frontend Nginx與backend FastAPI2workers兩個應用容器，外部Postgres、SMTP、host Tunnel。
2×60負載在獨立CI資料庫；public採teacher/student smoke。Latency數值為實測目標，依receipt回讀。
