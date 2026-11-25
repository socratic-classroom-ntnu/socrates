import type { components } from '../../../../contract/classroomTypes'

export type Transcript = components['schemas']['TeacherTranscriptView']
export type Attempt = NonNullable<Transcript['attempt']>
export type Scenario = Attempt['scenarios'][number]
export type Message = Attempt['messages'][number]
export type Summary = components['schemas']['PersonalSummaryView']
export type FinalSummary = components['schemas']['FinalSummaryView']
type ReviseHint = NonNullable<Message['revise_hint']>

export const REVIEW_STATES = ['reviewing', 'awaiting_reflection_prompt', 'reflecting', 'completed']

/** The reason a student gave for 不太對, as the system line names it; the key is a `transcript.reason.*` text. */
export type RejectReason = 'stance' | 'reason' | 'condition' | 'changedMind'
const REASON_KEYS: Record<ReviseHint, RejectReason> = {
  stance: 'stance', reason: 'reason', condition: 'condition', changed_mind: 'changedMind',
}

/**
 * One row of the chat, in the order it is read. Nothing here is text for the screen: system lines
 * carry what they are made of, and the page words them (the API does not word them either).
 */
export type ChatItem =
  | { kind: 'scenario'; key: string; index: number; name: string; text: string }
  | { kind: 'message'; key: string; message: Message }
  | { kind: 'reject'; key: string; scenario: number; reason: RejectReason | null }
  | { kind: 'rejectFinal'; key: string }
  | { kind: 'pending'; key: string; summary: Summary; capped: boolean }
  | { kind: 'review'; key: string }
  | { kind: 'confirm'; key: string }
  | { kind: 'budget'; key: string }

/** A scenario has no name of its own in the data: its first sentence stands in, cut short. */
export function scenarioName(text: string): string {
  const first = text.split(/[。！？!?\n]|\.(?:\s|$)/)[0]?.trim() ?? ''
  const chars = Array.from(first)
  return chars.length > 16 ? `${chars.slice(0, 16).join('')}…` : first
}

/** What the student chose to say was off, on the first message they sent after a press. */
function reasonAfter(press: number, messages: Message[]): RejectReason | null {
  const next = messages.find(message => message.role === 'student' && message.created_at > press)
  return next?.revise_hint ? REASON_KEYS[next.revise_hint] : null
}

export function buildChat(attempt: Attempt): ChatItem[] {
  const items: ChatItem[] = []
  const talk = attempt.messages.filter(message => !message.final_feedback)

  for (const scenario of attempt.scenarios) {
    items.push({ kind: 'scenario', key: `scenario-${scenario.index}`, index: scenario.index, name: scenarioName(scenario.text), text: scenario.text })
    const mine = talk.filter(message => message.scenario_index === scenario.index)
    const presses = [...scenario.rejected_at].sort((a, b) => a - b)
    let next = 0
    const pressesBefore = (time: number) => {
      while (next < presses.length && presses[next] < time) {
        const press = presses[next]
        items.push({ kind: 'reject', key: `reject-${scenario.index}-${next}`, scenario: scenario.index, reason: reasonAfter(press, mine) })
        next += 1
      }
    }
    for (const message of mine) {
      pressesBefore(message.created_at)
      items.push({ kind: 'message', key: message.id, message })
    }
    pressesBefore(Number.POSITIVE_INFINITY)
  }

  // The sentence on a final summary belongs to the review, not to the scenario it carries.
  for (const message of attempt.messages.filter(message => message.final_feedback)) {
    items.push({ kind: 'rejectFinal', key: `reject-final-${message.id}` })
    items.push({ kind: 'message', key: message.id, message })
  }

  if (attempt.state === 'confirming' && attempt.candidate_summary) {
    const current = attempt.scenarios.find(scenario => scenario.index === attempt.scenario_index)
    items.push({ kind: 'pending', key: 'pending-summary', summary: attempt.candidate_summary, capped: current?.status === 'capped' })
  }
  if (REVIEW_STATES.includes(attempt.state)) items.push({ kind: 'review', key: 'review' })
  // Only now: past scenarios that were confirmed earlier get no line.
  if (attempt.state === 'confirming') items.push({ kind: 'confirm', key: 'confirm' })
  if (attempt.state === 'budget_exhausted') items.push({ kind: 'budget', key: 'budget' })
  return items
}

/** The messages the "↓ N new" pill counts: the student's and Socrates', never system lines or labels. */
export function messageIds(items: ChatItem[]): string[] {
  return items.flatMap(item => item.kind === 'message' ? [item.message.id] : [])
}

// ---- the stance track (right column) ---------------------------------------------------------

export type TrackRow = {
  index: number
  name: string
  /** The live page's cell status for this scenario. */
  status: 'answering' | 'in_dialogue' | 'confirming' | 'confirmed' | 'capped'
  turns: number | null
  /** A confirmed stance, or the one being discussed while the student is confirming. */
  stance: string | null
  /** The summary exists (confirmed or waiting) but its position has no words yet. */
  stanceBlank: boolean
  /** Waiting for the student's 對／不太對 on a summary that came from running out of messages. */
  cappedConfirming: boolean
  rejections: number
  current: boolean
}

export function buildTrack(attempt: Attempt): TrackRow[] {
  const inReview = attempt.review_status !== 'not_started'
  return attempt.scenarios.map(scenario => {
    const cell = attempt.cells[scenario.index]
    const confirming = cell?.status === 'confirming'
    const summary = scenario.confirmed_summary ?? (confirming ? attempt.candidate_summary : null)
    return {
      index: scenario.index,
      name: scenarioName(scenario.text),
      status: cell?.status ?? 'in_dialogue',
      turns: cell?.turns ?? null,
      // A scenario that ran out of messages shows no stance, whatever the student was shown.
      stance: scenario.status === 'capped' && !confirming ? null : summary ? summary.current_position : null,
      stanceBlank: !!summary && !(scenario.status === 'capped' && !confirming) && summary.current_position.trim() === '',
      cappedConfirming: confirming && scenario.status === 'capped',
      rejections: scenario.rejected_at.length,
      current: !inReview && scenario.index === attempt.scenario_index,
    }
  })
}

// ---- where the student is, in the live page's words ------------------------------------------

export type Stage =
  | { kind: 'cell'; status: TrackRow['status']; turns: number | null }
  | { kind: 'review'; key: 'inProgress' | 'completed' | 'unconfirmed' }

export function stageOf(attempt: Attempt): Stage {
  if (attempt.review_status === 'completed') return { kind: 'review', key: attempt.final_status === 'unconfirmed' ? 'unconfirmed' : 'completed' }
  if (attempt.review_status === 'in_progress') return { kind: 'review', key: 'inProgress' }
  const cell = attempt.cells[attempt.scenario_index] ?? attempt.cells[attempt.cells.length - 1]
  return { kind: 'cell', status: cell?.status ?? 'answering', turns: cell?.turns ?? null }
}

/** The same two stops as the live page: the attempt is completed, or the activity is over. */
export function isStopped(transcript: Transcript): boolean {
  return transcript.attempt?.state === 'completed' || transcript.activity.status === 'ended'
}

/** How the page footer says it stopped. */
export function stopKind(transcript: Transcript): 'unconfirmed' | 'completed' | 'ended' | null {
  const attempt = transcript.attempt
  if (attempt?.state === 'completed') return attempt.final_status === 'unconfirmed' ? 'unconfirmed' : 'completed'
  return transcript.activity.status === 'ended' ? 'ended' : null
}

/** The student's own sentences on a final summary they turned down, oldest first (08). */
export function finalFeedback(attempt: Attempt): Message[] {
  return attempt.messages.filter(message => message.final_feedback)
}
