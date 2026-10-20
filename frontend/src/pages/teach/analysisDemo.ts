import type { components } from '../../api/classroomTypes'

export const ANALYSIS_SOURCE: 'api' | 'demo' = 'api'

type Analysis = components['schemas']['SoloActivityAnalysisView']
type Student = components['schemas']['SoloAnalysisStudentView']

const student = (index: number, changedFrom: string | null = null): Student => ({
  enrollment_id: `demo-${index}`,
  display_name: `示範學生 ${index}`,
  changed_from_option_id: changedFrom,
  reason_summary: index % 2 === 0 ? '我在意的是能不能避免更多傷害。' : '我不確定人數是否足以決定該怎麼做。',
  relevant_conditions: index % 3 === 0 ? ['沒有其他方法', '結果可以確定'] : [],
})

export const ANALYSIS_DEMO: Analysis = {
  activity_id: 'demo', title: '示意活動', course_id: 'demo', course_name: '示意課程', status: 'open',
  question_count: 2, ends_at: null, generated_at: 0, revision_id: 'demo',
  summary: { enrolled: 18, started: 18, done: 9, in_progress: 9 },
  questions: [
    {
      index: 0, question_id: 'demo-q1', title: '岔道上的選擇', confirmed: 14, unconfirmed: 4, changed: 3, comparable: 14,
      options: [
        { option_id: 'a', text: '拉下拉桿', count: 6, students: Array.from({ length: 6 }, (_, index) => student(index + 1)) },
        { option_id: 'b', text: '不拉', count: 8, students: Array.from({ length: 8 }, (_, index) => student(index + 7, index < 3 ? 'a' : null)) },
      ],
    },
    {
      index: 1, question_id: 'demo-q2', title: '天橋上的陌生人', confirmed: 12, unconfirmed: 6, changed: 2, comparable: 12,
      options: [
        { option_id: 'a', text: '推下去', count: 3, students: Array.from({ length: 3 }, (_, index) => student(index + 20)) },
        { option_id: 'b', text: '不推', count: 9, students: Array.from({ length: 9 }, (_, index) => student(index + 23, index < 2 ? 'a' : null)) },
      ],
    },
  ],
}
