// 樣式基準用的固定 API 回應。型別直接取自產生的 schema（satisfies），欄位缺了或多了 typecheck 會擋，
// 形狀才會跟後端一致。時間一律從 NOW 推算，NOW 也是頁面裡被固定住的時鐘（style-baseline.spec.ts）。
import type { components } from '../../src/contract/classroomTypes'

type S = components['schemas']

export const NOW = new Date('2026-11-05T10:00:00+08:00')
const now = Math.floor(NOW.getTime() / 1000)
const HOUR = 3600
const DAY = 24 * HOUR

export const account = {
  id: 'u-1', username: '林小華', email: 'student@example.org', email_masked: 's***@example.org', verified: true,
  authority_state: 'FULL_PRODUCT', csrf_token: 'csrf-baseline', points: 0, achievements: [], locale: 'zh-Hant',
} satisfies S['AccountView']

export const unverifiedAccount = {
  ...account, verified: false, authority_state: 'EMAIL_VERIFICATION',
  verification_delivery: { delivery_state: 'sent', expires_at: now + DAY, mail_id: 'mail-1' },
} satisfies S['AccountView']

const verificationStatus = {
  authority_state: 'EMAIL_VERIFICATION', email_masked: 's***@example.org', verified: false,
  delivery: { state: 'sent', sent_at: now - 120, delivered_at: now - 110, attempts: 1 },
} satisfies S['VerificationStatusView']

const questions = [
  {
    id: 'q-1', title: '岔道上的選擇',
    scenario: '一輛失控的電車正駛向五名工人。你站在轉轍器旁，拉下拉桿，電車會轉向另一條軌道，那裡有一名工人。',
    options: [{ id: 'o-pull', text: '拉下拉桿' }, { id: 'o-stay', text: '不拉' }],
    follow_up_direction: '追問學生如何看待「行動」與「不行動」的差別。',
  },
  {
    id: 'q-2', title: '天橋上的陌生人',
    scenario: '同一輛電車，這次你站在天橋上，身旁有一位體型壯碩的陌生人。把他推下去可以擋住電車。',
    options: [{ id: 'o-push', text: '推下去' }, { id: 'o-hold', text: '不推' }, { id: 'o-other', text: '另找辦法' }],
    follow_up_direction: '',
  },
] satisfies S['QuestionDraft'][]

const teacherCard = (id: string, title: string, status: S['ActivityTeacherCard']['status'], extra: Partial<S['ActivityTeacherCard']> = {}) => ({
  id, title, status, question_count: 2, has_unpublished_changes: false, locked: status !== 'draft',
  starts_at: status === 'draft' ? null : status === 'scheduled' ? now + DAY : now - 2 * HOUR,
  ends_at: status === 'draft' ? null : status === 'ended' ? now - HOUR : now + 3 * DAY,
  available_actions: status === 'draft' ? ['update', 'publish', 'copy', 'delete']
    : status === 'scheduled' ? ['update_details', 'start_now', 'copy', 'delete']
      : status === 'open' ? ['update_details', 'end_now', 'copy'] : ['copy'],
  ...extra,
}) satisfies S['ActivityTeacherCard']

const teacherCards = [
  teacherCard('a-open', '第三週倫理討論', 'open'),
  teacherCard('a-scheduled', '第四週：天橋難題', 'scheduled'),
  teacherCard('a-draft', '第五週草稿', 'draft', { question_count: 1 }),
  teacherCard('a-ended', '第二週：說謊可以嗎', 'ended'),
]

const studentCard = ({ id, title, status, question_count, starts_at, ends_at }: S['ActivityTeacherCard']) =>
  ({ id, title, status: status === 'draft' ? 'scheduled' : status, question_count, starts_at, ends_at }) satisfies S['ActivityStudentCard']

const studentCards = teacherCards.filter(card => card.status !== 'draft').map(studentCard)

const courseLists = {
  teaching: [
    { id: 'c-1', name: '哲學導論', teacher_name: '林小華', code: '3CKTGE7Q', code_enabled: true, student_count: 35, activity_count: 4, open_activity_count: 1 },
    { id: 'c-2', name: '科技系統與社會發展 A', teacher_name: '林小華', code: 'K7M2QX9P', code_enabled: false, student_count: 0, activity_count: 0, open_activity_count: 0 },
  ],
  learning: [
    { id: 'c-1', name: '哲學導論', teacher_name: '王思齊', open_activity_count: 1, highlight: studentCards[0] },
    { id: 'c-3', name: '倫理學專題', teacher_name: '陳雅婷', open_activity_count: 0, highlight: studentCards[1] },
    { id: 'c-4', name: '邏輯與批判思考', teacher_name: '張家豪', open_activity_count: 0, highlight: null },
  ],
} satisfies S['CourseLists']

const teacherCourse = {
  id: 'c-1', role: 'teacher', name: '哲學導論', teacher_name: '林小華', code: '3CKTGE7Q', code_enabled: true,
  intro: '從經典思想實驗出發，練習說清楚自己的立場與理由。', goals: '能分辨後果與義務的考量。',
  student_count: 35, activity_count: 4, available_actions: ['update', 'rotate_code', 'disable_code', 'create_activity'],
} satisfies S['CourseTeacherView']

const studentCourse = {
  id: 'c-1', role: 'student', name: '哲學導論', teacher_name: '王思齊', code: '3CKTGE7Q', display_name: '小華',
  intro: '從經典思想實驗出發，練習說清楚自己的立場與理由。',
} satisfies S['CourseStudentView']

const activityView = (card: S['ActivityTeacherCard']) => ({
  id: card.id, course_id: 'c-1', status: card.status, locked: card.locked, revision: card.status === 'draft' ? null : 1,
  has_unpublished_changes: false, starts_at: card.starts_at, ends_at: card.ends_at, available_actions: card.available_actions,
  draft: {
    title: card.title, topic_direction: '電車難題', analysis_focus: '學生是否區分行動與不行動',
    starts_at: card.starts_at, ends_at: card.ends_at ?? now + 3 * DAY, questions: card.question_count === 1 ? questions.slice(0, 1) : questions,
  },
}) satisfies S['ActivityTeacherView']

const joinPreview = {
  course_id: 'c-1', name: '哲學導論', teacher_name: '王思齊', default_display_name: '林小華',
  already_enrolled: false, open_activity_title: '第三週倫理討論',
} satisfies S['JoinPreview']

const activityJoinPreview = {
  activity_id: 'a-open', title: '第三週倫理討論', course_id: 'c-1', course_name: '哲學導論', teacher_name: '王思齊',
  status: 'open', question_count: 2, starts_at: now - 2 * HOUR, ends_at: now + 3 * DAY,
  default_display_name: '林小華', already_enrolled: false,
} satisfies S['ActivityJoinPreview']

const attemptId = 'attempt-1'

const soloActivity = {
  activity_id: 'a-open', title: '第三週倫理討論', course_id: 'c-1', course_name: '哲學導論', status: 'open',
  question_count: 2, ends_at: now + 3 * DAY,
  attempt: {
    id: attemptId, state: 'in_dialogue', question_index: 0, current_turn: 2, review_status: 'not_started',
    progress: [
      { index: 0, title: '岔道上的選擇', status: 'in_dialogue', option_label: 'A' },
      { index: 1, title: null, status: 'not_started', option_label: null },
    ],
  },
} satisfies S['SoloActivityView']

const attempt = {
  id: attemptId, activity_id: 'a-open', activity_title: '第三週倫理討論', course_id: 'c-1', course_name: '哲學導論',
  display_name: '小華', state: 'in_dialogue', question_index: 0, question_count: 2, revising: false,
  questions: [{
    index: 0, id: 'q-1', title: questions[0].title, scenario: questions[0].scenario, options: questions[0].options,
    stance: { option_id: 'o-pull', current_option_id: 'o-pull', reason: '五個人比一個人多，救多數人比較好。' },
    status: 'in_progress', confirmed_summary: null,
  }],
  messages: [
    { id: 'm-1', role: 'student', text: '五個人比一個人多，救多數人比較好。', question_index: 0, created_at: now - 300, move: null, revise_hint: null },
    { id: 'm-2', role: 'tutor', text: '你提到「多數」。如果那一名工人是你認識的人，你的判斷會改變嗎？', question_index: 0, created_at: now - 280, move: 'probe', revise_hint: null },
    { id: 'm-3', role: 'student', text: '會猶豫，但我覺得道理上還是應該拉。', question_index: 0, created_at: now - 120, move: null, revise_hint: null },
    { id: 'm-4', role: 'tutor', text: '「道理上」和「實際上」之間的落差，你覺得是什麼造成的？', question_index: 0, created_at: now - 100, move: 'clarify', revise_hint: null },
  ],
  candidate_summary: null, rejected_summary: null, summary_digest: null, principle_hint: null, notice: null,
  available_actions: ['send_message'],
} satisfies S['SoloAttemptView']

const progress = {
  activity_id: 'a-open', course_id: 'c-1', course_name: '哲學導論', title: '第三週倫理討論', status: 'open',
  ends_at: now + 3 * DAY, generated_at: now, question_count: 2,
  questions: [{ index: 0, title: '岔道上的選擇' }, { index: 1, title: '天橋上的陌生人' }],
  summary: { enrolled: 4, started: 3, done: 1, attention: 1, unconfirmed_by_question: [1, 2] },
  students: [
    { enrollment_id: 'e-1', display_name: '小華', overall: 'done', review_status: 'in_progress', attention: false, last_activity_at: now - 600,
      cells: [{ status: 'confirmed', turns: 4 }, { status: 'confirmed', turns: 3 }] },
    { enrollment_id: 'e-2', display_name: '阿明', overall: 'in_progress', review_status: 'not_started', attention: true, last_activity_at: now - 1800,
      cells: [{ status: 'confirming', turns: 6 }, { status: 'not_started', turns: null }] },
    { enrollment_id: 'e-3', display_name: '佳穎', overall: 'in_progress', review_status: 'not_started', attention: false, last_activity_at: now - 60,
      cells: [{ status: 'confirmed', turns: 2 }, { status: 'in_dialogue', turns: 1 }] },
    { enrollment_id: 'e-4', display_name: '志豪', overall: 'not_started', review_status: 'not_started', attention: false, last_activity_at: null,
      cells: [{ status: 'not_started', turns: null }, { status: 'not_started', turns: null }] },
  ],
} satisfies S['SoloActivityProgressView']

const analysisStudent = (enrollment_id: string, display_name: string, reason_summary: string, changed_from_option_id: string | null = null) =>
  ({ enrollment_id, display_name, reason_summary, changed_from_option_id, relevant_conditions: ['人數差距很大'] }) satisfies S['SoloAnalysisStudentView']

const analysis = {
  activity_id: 'a-ended', course_id: 'c-1', course_name: '哲學導論', title: '第二週：說謊可以嗎', status: 'ended',
  ends_at: now - HOUR, generated_at: now, question_count: 2, revision_id: 'rev-1',
  summary: { enrolled: 4, started: 3, done: 2, in_progress: 1 },
  questions: [
    { question_id: 'q-1', index: 0, title: '岔道上的選擇', confirmed: 3, unconfirmed: 0, comparable: 3, changed: 1, options: [
      { option_id: 'o-pull', text: '拉下拉桿', count: 2, students: [
        analysisStudent('e-1', '小華', '救多數人的後果比較好。'), analysisStudent('e-3', '佳穎', '不行動也是一種選擇。', 'o-stay')] },
      { option_id: 'o-stay', text: '不拉', count: 1, students: [analysisStudent('e-2', '阿明', '主動造成傷害跟放任不同。')] },
    ] },
    { question_id: 'q-2', index: 1, title: '天橋上的陌生人', confirmed: 2, unconfirmed: 1, comparable: 2, changed: 0, options: [
      { option_id: 'o-push', text: '推下去', count: 0, students: [] },
      { option_id: 'o-hold', text: '不推', count: 2, students: [analysisStudent('e-1', '小華', '把人當工具不對。'), analysisStudent('e-3', '佳穎', '身體接觸讓我做不到。')] },
      { option_id: 'o-other', text: '另找辦法', count: 0, students: [] },
    ] },
  ],
} satisfies S['SoloActivityAnalysisView']

/** `GET <path?query>` → body。沒列到的請求一律回 404，並記在基準輸出的 unmocked 裡。 */
export function classroomRoutes(options: { signedIn: boolean; verified?: boolean }): Record<string, unknown> {
  const me = options.verified === false ? unverifiedAccount : account
  const routes: Record<string, unknown> = {
    'GET /courses': courseLists,
    'GET /courses/c-1?role=teacher': teacherCourse,
    'GET /courses/c-1?role=student': studentCourse,
    'GET /courses/c-1/activities?role=teacher': { role: 'teacher', items: teacherCards } satisfies S['ActivityTeacherList'],
    'GET /courses/c-1/activities?role=student': { role: 'student', items: studentCards } satisfies S['ActivityStudentList'],
    'GET /course-join/preview?code=3CKTGE7Q': joinPreview,
    'GET /activities/a-open/join-preview': activityJoinPreview,
    'GET /solo/activities/a-open': soloActivity,
    [`GET /solo/attempts/${attemptId}`]: attempt,
    'GET /solo/activities/a-open/progress': progress,
    'GET /solo/activities/a-ended/analysis': analysis,
    'GET /auth/verification-status': verificationStatus,
    'GET /solo/activities/a-ended/progress': { ...progress, activity_id: 'a-ended', title: '第二週：說謊可以嗎', status: 'ended', ends_at: now - HOUR },
    'GET /classrooms': [] satisfies S['RoomSummary'][],
    // 開發控制台只在 debug_mode 為 true 時出現；基準照正式環境的樣子關掉
    'GET /public-config': { debug_mode: false, google_cse_id: '', search_scope: '', search_state: 'disabled' } satisfies S['PublicConfigView'],
  }
  for (const card of teacherCards) routes[`GET /activities/${card.id}`] = activityView(card)
  if (options.signedIn) routes['GET /auth/me'] = me
  return routes
}
