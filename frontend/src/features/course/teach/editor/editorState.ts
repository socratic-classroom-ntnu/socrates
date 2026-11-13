import type { components } from '../../../../contract/classroomTypes'

// T3 表單的狀態與規則：純函式，頁面和草稿復原都用這裡。
// 出題只有一個輸入：老師寫的文字就是活動名稱，也是第一個情境的材料。
export type StartForm = { mode: 'now' } | { mode: 'at'; date: string; time: string }
export type ActivityForm = {
  title: string
  start: StartForm
  end: { date: string; time: string }
}
type DraftIn = components['schemas']['ActivityDraft']
type DraftOut = components['schemas']['ActivityDraft']

export const LIMITS = { title: 300 } as const

export type Problem = { field: string; kind: 'required' | 'endBeforeStart' | 'endPast' | 'startPast' }

export function emptyForm(): ActivityForm {
  return { title: '', start: { mode: 'now' }, end: { date: '', time: '' } }
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
    start: d.starts_at === null || d.starts_at === undefined ? { mode: 'now' } : { mode: 'at', ...fromEpochSeconds(d.starts_at) },
    end: fromEpochSeconds(d.ends_at),
  }
}

/** Only call after `validate` found nothing: the backend rejects incomplete drafts. */
export function toDraft(f: ActivityForm): DraftIn {
  return {
    title: f.title.trim(),
    starts_at: f.start.mode === 'now' ? null : toEpochSeconds(f.start.date, f.start.time),
    ends_at: toEpochSeconds(f.end.date, f.end.time) as number,
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
  return problems
}

const TOP_FIELDS: Record<string, string> = { title: 'title', starts_at: 'start', ends_at: 'end' }

/** FastAPI 422 `loc` paths → the same field ids `validate` uses; unknown paths are dropped. */
export function problemsFrom422(detail: unknown): Problem[] {
  if (!Array.isArray(detail)) return []
  const found: Problem[] = []
  for (const issue of detail) {
    const loc = (issue as { loc?: unknown })?.loc
    if (!Array.isArray(loc) || loc[0] !== 'body' || loc.length !== 2) continue
    const field = typeof loc[1] === 'string' ? TOP_FIELDS[loc[1]] : undefined
    if (field) found.push({ field, kind: 'required' })
  }
  return found
}
