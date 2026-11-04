import {
  addOption, addQuestion, type ActivityForm, emptyForm, emptyQuestion, fromDraft, fromEpochSeconds, moveQuestion,
  problemCountByQuestion, problemsFrom422, type QuestionForm, removeOption, removeQuestion, toDraft, toEpochSeconds, validate,
} from './editorState'

const NOW = 1_800_000_000
let counter = 0
beforeEach(() => {
  // setupTests 把 randomUUID 固定成同一個值；這裡要每次不同
  Object.defineProperty(globalThis, 'crypto', { configurable: true, value: { randomUUID: () => `00000000-0000-4000-8000-${String(++counter).padStart(12, '0')}` } })
})

test('new questions get distinct ids without dashes', () => {
  const a = emptyQuestion(), b = emptyQuestion()
  expect(a.id).not.toBe(b.id)
  expect(a.id).not.toContain('-')
  expect(a.options[0].id).not.toBe(a.options[1].id)
})

function question(id: string, extra: Partial<QuestionForm> = {}): QuestionForm {
  return { id, title: '題目' + id, scenario: '情境' + id, options: [{ id: id + 'a', text: '拉' }, { id: id + 'b', text: '不拉' }], follow_up_direction: '', ...extra }
}

function complete(extra: Partial<ActivityForm> = {}): ActivityForm {
  const end = fromEpochSeconds(NOW + 86400)
  return { title: '第三週倫理討論', topic_direction: '主動與不作為', analysis_focus: '', start: { mode: 'now' }, end, questions: [question('q1'), question('q2')], ...extra }
}

test('validate reproduces the T3E example', () => {
  const form = complete({
    end: { date: '', time: '' },
    questions: [question('q1'), question('q2', { scenario: '', options: [{ id: 'q2a', text: '把那個人推下去' }, { id: 'q2b', text: '  ' }] })],
  })
  const problems = validate(form, NOW)
  expect(problems.map(p => [p.field, p.kind])).toEqual([
    ['end', 'required'],
    ['q-q2-scenario', 'required'],
    ['q-q2-opt-q2b', 'required'],
  ])
  expect(problemCountByQuestion(problems)).toEqual({ q2: 2 })
})

test('a complete form has no problems', () => {
  expect(validate(complete(), NOW)).toEqual([])
})

test('validate requires names and topic', () => {
  const problems = validate(complete({ title: ' ', topic_direction: '' }), NOW)
  expect(problems.map(p => p.field)).toEqual(['title', 'topic_direction'])
})

test('validate time order', () => {
  const start = fromEpochSeconds(NOW + 7200)
  const end = fromEpochSeconds(NOW + 3600)
  expect(validate(complete({ start: { mode: 'at', ...start }, end }), NOW).map(p => [p.field, p.kind])).toEqual([['end', 'endBeforeStart']])
  expect(validate(complete({ end: fromEpochSeconds(NOW - 60) }), NOW).map(p => [p.field, p.kind])).toEqual([['end', 'endPast']])
  expect(validate(complete({ start: { mode: 'at', date: '', time: '' } }), NOW).map(p => [p.field, p.kind])).toEqual([['start', 'required']])
})

test('validate flags a past start', () => {
  const past = { mode: 'at' as const, ...fromEpochSeconds(NOW - 120) }
  expect(validate(complete({ start: past }), NOW).map(p => [p.field, p.kind])).toEqual([['start', 'startPast']])
  // 「建立後立刻開放」不檢查；已經開放的活動開始時間固定，也不檢查
  expect(validate(complete({ start: { mode: 'now' } }), NOW)).toEqual([])
  expect(validate(complete({ start: past }), NOW, { startFixed: true })).toEqual([])
})

describe.each(['Asia/Taipei', 'America/Los_Angeles'])('time zone %s', zone => {
  const original = process.env.TZ
  beforeAll(() => { process.env.TZ = zone })
  afterAll(() => { process.env.TZ = original })

  test('toEpochSeconds round trip', () => {
    const seconds = toEpochSeconds('2026-10-24', '23:59')
    expect(seconds).toBe(new Date(2026, 9, 24, 23, 59).getTime() / 1000)
    expect(fromEpochSeconds(seconds as number)).toEqual({ date: '2026-10-24', time: '23:59' })
    expect(toEpochSeconds('', '23:59')).toBeNull()
    expect(toEpochSeconds('2026-10-24', '')).toBeNull()
  })
})

test('toDraft and fromDraft round trip', () => {
  const form = complete({ start: { mode: 'at', ...fromEpochSeconds(NOW + 600) }, analysis_focus: '想看理由' })
  const draft = toDraft(form)
  expect(draft).toEqual({
    title: '第三週倫理討論', topic_direction: '主動與不作為', analysis_focus: '想看理由',
    starts_at: toEpochSeconds(form.start.mode === 'at' ? form.start.date : '', form.start.mode === 'at' ? form.start.time : ''),
    ends_at: toEpochSeconds(form.end.date, form.end.time),
    questions: form.questions.map(q => ({ id: q.id, title: q.title, scenario: q.scenario, options: q.options, follow_up_direction: '' })),
  })
  expect(fromDraft({ ...draft, analysis_focus: '想看理由' })).toEqual(form)
})

test('now mode sends null starts_at and trims text', () => {
  const draft = toDraft(complete({ title: '  名稱  ', questions: [question('q1', { options: [{ id: 'a', text: ' 拉 ' }, { id: 'b', text: '不拉' }] })] }))
  expect(draft.starts_at).toBeNull()
  expect(draft.title).toBe('名稱')
  expect(draft.questions[0].options[0].text).toBe('拉')
})

test('empty form starts with one blank question and two blank options', () => {
  const form = emptyForm()
  expect(form.start).toEqual({ mode: 'now' })
  expect(form.end).toEqual({ date: '', time: '' })
  expect(form.questions).toHaveLength(1)
  expect(form.questions[0].options).toHaveLength(2)
  expect(form.questions[0].options.every(option => option.text === '')).toBe(true)
})

test('option and question limits', () => {
  let form = complete({ questions: [question('q1')] })
  form = addOption(form, 'q1')
  form = addOption(form, 'q1')
  expect(form.questions[0].options).toHaveLength(4)
  expect(addOption(form, 'q1')).toBe(form)
  const two = complete({ questions: [question('q1')] })
  expect(removeOption(two, 'q1', 'q1a')).toBe(two)
  expect(removeQuestion(two, 'q1')).toBe(two)
  let many = complete({ questions: [] })
  for (let i = 0; i < 30; i++) many = addQuestion(many)
  expect(many.questions).toHaveLength(30)
  expect(addQuestion(many)).toBe(many)
  const three = addOption(complete({ questions: [question('q1')] }), 'q1')
  expect(removeOption(three, 'q1', 'q1a').questions[0].options.map(o => o.id)).toEqual(['q1b', three.questions[0].options[2].id])
})

test('moveQuestion keeps ids', () => {
  const form = complete({ questions: [question('a'), question('b'), question('c')] })
  expect(moveQuestion(form, 0, 2).questions.map(q => q.id)).toEqual(['b', 'c', 'a'])
  expect(moveQuestion(form, 2, 0).questions.map(q => q.id)).toEqual(['c', 'a', 'b'])
  expect(form.questions.map(q => q.id)).toEqual(['a', 'b', 'c'])
})

test('problemsFrom422 maps pydantic locations', () => {
  const form = complete()
  const detail = [
    { loc: ['body', 'title'], type: 'string_too_long' },
    { loc: ['body', 'questions', 1, 'options', 1, 'text'], type: 'string_too_short' },
    { loc: ['body', 'questions', 0, 'scenario'], type: 'missing' },
    { loc: ['body', 'ends_at'], type: 'missing' },
    { loc: ['body', 'nonsense'], type: 'missing' },
  ]
  expect(problemsFrom422(detail, form).map(p => [p.field, p.questionId])).toEqual([
    ['title', undefined],
    ['q-q2-opt-q2b', 'q2'],
    ['q-q1-scenario', 'q1'],
    ['end', undefined],
  ])
  expect(problemsFrom422('ACTIVITY_TIME_INVALID', form)).toEqual([])
})
