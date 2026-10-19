import type { components } from '../../../api/classroomTypes'

// T3 表單的狀態與規則：純函式，頁面、AI 出題、匯入都用這裡。
export type OptionForm = { id: string; text: string }
export type QuestionForm = { id: string; title: string; scenario: string; options: OptionForm[]; follow_up_direction: string }
export type StartForm = { mode: 'now' } | { mode: 'at'; date: string; time: string }
export type ActivityForm = {
  title: string
  topic_direction: string
  analysis_focus: string
  start: StartForm
  end: { date: string; time: string }
  questions: QuestionForm[]
}
type DraftIn = components['schemas']['ActivityDraft-Input']
type DraftOut = components['schemas']['ActivityDraft-Output']

export const LIMITS = { questions: 30, options: [2, 4], title: 300, topic: 4000, analysis: 4000, questionTitle: 300, scenario: 12000, option: 2000, followUp: 2000 } as const

export type Problem = { field: string; questionId?: string; kind: 'required' | 'optionsMin' | 'endBeforeStart' | 'endPast' | 'startPast' }

export function newId(): string {
  return crypto.randomUUID().replace(/-/g, '')
}

export function emptyQuestion(): QuestionForm {
  return { id: newId(), title: '', scenario: '', options: [{ id: newId(), text: '' }, { id: newId(), text: '' }], follow_up_direction: '' }
}

export function emptyForm(): ActivityForm {
  return { title: '', topic_direction: '', analysis_focus: '', start: { mode: 'now' }, end: { date: '', time: '' }, questions: [emptyQuestion()] }
}

const pad = (n: number) => String(n).padStart(2, '0')

/** Local date and time (what the teacher typed) → Unix seconds; empty parts → null. */
export function toEpochSeconds(date: string, time: string): number | null {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  const t = /^(\d{2}):(\d{2})$/.exec(time)
  if (!d || !t) return null
  return new Date(Number(d[1]), Number(d[2]) - 1, Number(d[3]), Number(t[1]), Number(t[2])).getTime() / 1000
}

export function fromEpochSeconds(seconds: number): { date: string; time: string } {
  const at = new Date(seconds * 1000)
  return { date: `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`, time: `${pad(at.getHours())}:${pad(at.getMinutes())}` }
}

export function fromDraft(d: DraftOut | DraftIn): ActivityForm {
  return {
    title: d.title,
    topic_direction: d.topic_direction,
    analysis_focus: d.analysis_focus ?? '',
    start: d.starts_at === null || d.starts_at === undefined ? { mode: 'now' } : { mode: 'at', ...fromEpochSeconds(d.starts_at) },
    end: fromEpochSeconds(d.ends_at),
    questions: d.questions.map(q => ({
      id: q.id, title: q.title, scenario: q.scenario,
      options: q.options.map(o => ({ id: o.id, text: o.text })),
      follow_up_direction: q.follow_up_direction ?? '',
    })),
  }
}

/** Only call after `validate` found nothing: the backend rejects incomplete drafts. */
export function toDraft(f: ActivityForm): DraftIn {
  return {
    title: f.title.trim(),
    topic_direction: f.topic_direction.trim(),
    analysis_focus: f.analysis_focus.trim(),
    starts_at: f.start.mode === 'now' ? null : toEpochSeconds(f.start.date, f.start.time),
    ends_at: toEpochSeconds(f.end.date, f.end.time) as number,
    questions: f.questions.map(q => ({
      id: q.id, title: q.title.trim(), scenario: q.scenario,
      options: q.options.map(o => ({ id: o.id, text: o.text.trim() })),
      follow_up_direction: q.follow_up_direction.trim(),
    })),
  }
}

const blank = (value: string) => value.trim() === ''

/** Every gap, in the order it appears on screen (T3E). */
/** `startFixed`: the activity already opened, so its start is history, not a choice. */
export function validate(f: ActivityForm, nowSeconds: number, options: { startFixed?: boolean } = {}): Problem[] {
  const problems: Problem[] = []
  if (blank(f.title)) problems.push({ field: 'title', kind: 'required' })
  const start = f.start.mode === 'at' ? toEpochSeconds(f.start.date, f.start.time) : null
  if (f.start.mode === 'at' && !options.startFixed) {
    // 選擇器選不到過去的時間，但複製舊活動會帶著舊的開始時間進來
    if (start === null) problems.push({ field: 'start', kind: 'required' })
    else if (start <= nowSeconds) problems.push({ field: 'start', kind: 'startPast' })
  }
  const end = toEpochSeconds(f.end.date, f.end.time)
  if (end === null) problems.push({ field: 'end', kind: 'required' })
  else if (start !== null && end <= start) problems.push({ field: 'end', kind: 'endBeforeStart' })
  else if (end <= nowSeconds) problems.push({ field: 'end', kind: 'endPast' })
  if (blank(f.topic_direction)) problems.push({ field: 'topic_direction', kind: 'required' })
  for (const q of f.questions) {
    if (blank(q.title)) problems.push({ field: `q-${q.id}-title`, questionId: q.id, kind: 'required' })
    if (blank(q.scenario)) problems.push({ field: `q-${q.id}-scenario`, questionId: q.id, kind: 'required' })
    if (q.options.length < LIMITS.options[0]) problems.push({ field: `q-${q.id}-options`, questionId: q.id, kind: 'optionsMin' })
    for (const o of q.options) if (blank(o.text)) problems.push({ field: `q-${q.id}-opt-${o.id}`, questionId: q.id, kind: 'required' })
  }
  return problems
}

export function problemCountByQuestion(problems: Problem[]): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const p of problems) if (p.questionId) counts[p.questionId] = (counts[p.questionId] ?? 0) + 1
  return counts
}

const TOP_FIELDS: Record<string, string> = { title: 'title', topic_direction: 'topic_direction', analysis_focus: 'analysis_focus', starts_at: 'start', ends_at: 'end' }

/** FastAPI 422 `loc` paths → the same field ids `validate` uses; unknown paths are dropped. */
export function problemsFrom422(detail: unknown, f: ActivityForm): Problem[] {
  if (!Array.isArray(detail)) return []
  const found: Problem[] = []
  for (const issue of detail) {
    const loc = (issue as { loc?: unknown })?.loc
    if (!Array.isArray(loc) || loc[0] !== 'body') continue
    const [, first, index, part, optionIndex] = loc
    if (typeof first === 'string' && first in TOP_FIELDS && loc.length === 2) {
      found.push({ field: TOP_FIELDS[first], kind: 'required' })
      continue
    }
    const q = first === 'questions' && typeof index === 'number' ? f.questions[index] : undefined
    if (!q) continue
    if (part === 'title' || part === 'scenario') found.push({ field: `q-${q.id}-${part}`, questionId: q.id, kind: 'required' })
    else if (part === 'options' && typeof optionIndex === 'number' && q.options[optionIndex]) {
      found.push({ field: `q-${q.id}-opt-${q.options[optionIndex].id}`, questionId: q.id, kind: 'required' })
    } else if (part === 'options') found.push({ field: `q-${q.id}-options`, questionId: q.id, kind: 'optionsMin' })
  }
  return found
}

function mapQuestion(f: ActivityForm, qid: string, change: (q: QuestionForm) => QuestionForm | null): ActivityForm {
  let changed = false
  const questions = f.questions.map(q => {
    if (q.id !== qid) return q
    const next = change(q)
    if (next === null) return q
    changed = true
    return next
  })
  return changed ? { ...f, questions } : f
}

export function moveQuestion(f: ActivityForm, from: number, to: number): ActivityForm {
  if (from === to || from < 0 || to < 0 || from >= f.questions.length || to >= f.questions.length) return f
  const questions = [...f.questions]
  const [moved] = questions.splice(from, 1)
  questions.splice(to, 0, moved)
  return { ...f, questions }
}

export function addQuestion(f: ActivityForm): ActivityForm {
  return insertQuestion(f, f.questions.length, emptyQuestion())
}

export function insertQuestion(f: ActivityForm, index: number, q: QuestionForm): ActivityForm {
  if (f.questions.length >= LIMITS.questions) return f
  const questions = [...f.questions]
  questions.splice(index, 0, q)
  return { ...f, questions }
}

export function replaceQuestion(f: ActivityForm, index: number, q: QuestionForm): ActivityForm {
  if (index < 0 || index >= f.questions.length) return f
  const questions = [...f.questions]
  questions[index] = q
  return { ...f, questions }
}

export function removeQuestion(f: ActivityForm, qid: string): ActivityForm {
  if (f.questions.length <= 1) return f
  return { ...f, questions: f.questions.filter(q => q.id !== qid) }
}

export function addOption(f: ActivityForm, qid: string): ActivityForm {
  return mapQuestion(f, qid, q => q.options.length >= LIMITS.options[1] ? null : { ...q, options: [...q.options, { id: newId(), text: '' }] })
}

export function removeOption(f: ActivityForm, qid: string, oid: string): ActivityForm {
  return mapQuestion(f, qid, q => q.options.length <= LIMITS.options[0] ? null : { ...q, options: q.options.filter(o => o.id !== oid) })
}

export function updateQuestion(f: ActivityForm, qid: string, patch: Partial<Omit<QuestionForm, 'id' | 'options'>>): ActivityForm {
  return mapQuestion(f, qid, q => ({ ...q, ...patch }))
}

export function updateOption(f: ActivityForm, qid: string, oid: string, text: string): ActivityForm {
  return mapQuestion(f, qid, q => ({ ...q, options: q.options.map(o => o.id === oid ? { ...o, text } : o) }))
}
