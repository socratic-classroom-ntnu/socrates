import {
  type ActivityForm, emptyForm, fromDraft, fromEpochSeconds, problemsFrom422, toDraft, toEpochSeconds, validate,
} from './editorState'

const NOW = 1_800_000_000

function complete(extra: Partial<ActivityForm> = {}): ActivityForm {
  const end = fromEpochSeconds(NOW + 86400)
  return { title: '第三週倫理討論', start: { mode: 'now' }, end, ...extra }
}

test('validate lists the missing topic and end in screen order', () => {
  const problems = validate(complete({ title: ' ', end: { date: '', time: '' } }), NOW)
  expect(problems.map(p => [p.field, p.kind])).toEqual([
    ['title', 'required'],
    ['end', 'required'],
  ])
})

test('a complete form has no problems', () => {
  expect(validate(complete(), NOW)).toEqual([])
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
  const form = complete({ start: { mode: 'at', ...fromEpochSeconds(NOW + 600) } })
  const draft = toDraft(form)
  expect(draft).toEqual({
    title: '第三週倫理討論',
    starts_at: toEpochSeconds(form.start.mode === 'at' ? form.start.date : '', form.start.mode === 'at' ? form.start.time : ''),
    ends_at: toEpochSeconds(form.end.date, form.end.time),
  })
  expect(fromDraft(draft)).toEqual(form)
})

test('the draft body has only the single input and the window', () => {
  const draft = toDraft(complete())
  expect(Object.keys(draft).sort()).toEqual(['ends_at', 'starts_at', 'title'])
})

test('now mode sends null starts_at and trims the topic', () => {
  const draft = toDraft(complete({ title: '  名稱  ' }))
  expect(draft.starts_at).toBeNull()
  expect(draft.title).toBe('名稱')
})

test('empty form is one blank topic with an open-now start', () => {
  const form = emptyForm()
  expect(form).toEqual({ title: '', start: { mode: 'now' }, end: { date: '', time: '' } })
})

test('problemsFrom422 maps pydantic locations', () => {
  const detail = [
    { loc: ['body', 'title'], type: 'string_too_long' },
    { loc: ['body', 'ends_at'], type: 'missing' },
    { loc: ['body', 'starts_at'], type: 'float_parsing' },
    { loc: ['body', 'nonsense'], type: 'missing' },
    { loc: ['body', 'title', 'extra'], type: 'missing' },
  ]
  expect(problemsFrom422(detail).map(p => p.field)).toEqual(['title', 'end', 'start'])
  expect(problemsFrom422('ACTIVITY_TIME_INVALID')).toEqual([])
})
