// 課堂／組別 phase 的顯示文字，全前端只用這一份（學生首頁、課程紀錄、教師分組總覽、組別頁首）。
// 鍵對齊後端實際會寫入的 phase（orchestrator/classroom.py、domain/group_run.py、routes/groups.py）。
// 不認得的 phase 一律顯示「進行中」，不猜一個可能誤導的狀態。
export const PHASE_LABELS: Readonly<Record<string, string>> = Object.freeze({
  lobby: '準備中',
  countdown: '即將開始',
  answering: '作答中',
  personal: '個人對話',
  distribution: '觀點分布',
  arena: '討論中',
  focus: '深入討論',
  focus_summary: '討論小結',
  viewpoint_review: '確認觀點',
  final_reflection: '最後反思',
  question_summary: '本題小結',
  preview: '下一題預覽',
  summary: '課堂回顧',
  group_overview: '分組進行中',
})

export const UNKNOWN_PHASE_LABEL = '進行中'

export function phaseLabel(phase: string | null | undefined): string {
  return phase && Object.prototype.hasOwnProperty.call(PHASE_LABELS, phase) ? PHASE_LABELS[phase] : UNKNOWN_PHASE_LABEL
}
