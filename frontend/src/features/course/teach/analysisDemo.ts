import type { components } from '../../../contract/classroomTypes'

export const ANALYSIS_SOURCE: 'api' | 'demo' = 'api'

type Analysis = components['schemas']['SoloActivityAnalysisView']
type Student = components['schemas']['SoloAnalysisStudentView']

const POSITIONS = ['拉下拉桿，犧牲一人救五人', '不拉，因為不該主動傷害無辜', '看情況，要先知道有沒有其他辦法']

const student = (index: number): Student => ({
  enrollment_id: `demo-${index}`,
  display_name: `示範學生 ${index}`,
  confirmed_scenarios: (index % 3) + 1,
  current_position: POSITIONS[index % POSITIONS.length],
  reason_summary: index % 2 === 0 ? '我在意的是能不能避免更多傷害。' : '我不確定人數是否足以決定該怎麼做。',
  relevant_conditions: index % 3 === 0 ? ['沒有其他方法', '結果可以確定'] : [],
})

export const ANALYSIS_DEMO: Analysis = {
  activity_id: 'demo', title: '示意活動', course_id: 'demo', course_name: '示意課程', status: 'open',
  ends_at: null, generated_at: 0, revision_id: 'demo',
  summary: { enrolled: 18, started: 18, done: 9, in_progress: 9 },
  students: Array.from({ length: 12 }, (_, index) => student(index + 1)),
}
