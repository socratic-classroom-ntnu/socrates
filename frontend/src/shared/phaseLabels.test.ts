import { PHASE_LABELS, phaseLabel } from './phaseLabels'

test('every phase the backend writes has a label; unknown phases read 進行中', () => {
  expect(phaseLabel('viewpoint_review')).toBe('確認觀點')
  expect(phaseLabel('final_reflection')).toBe('最後反思')
  expect(phaseLabel('preview')).toBe('下一題預覽')
  expect(phaseLabel('question_summary')).toBe('本題小結')
  // 後端沒有 ended 這個 phase，不能顯示「已結束」誤導老師
  expect(PHASE_LABELS).not.toHaveProperty('ended')
  expect(phaseLabel('ended')).toBe('進行中')
  expect(phaseLabel('something_new')).toBe('進行中')
  expect(phaseLabel('constructor')).toBe('進行中')
  expect(phaseLabel(null)).toBe('進行中')
})
