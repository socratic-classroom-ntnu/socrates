import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react'
import { formatDateTime } from '../../../../i18n/format'
import { useT } from '../../../../i18n/useT'
import { PendingSummary, ReviewSection } from './TranscriptCards'
import { buildChat, messageIds, stageOf, type Attempt, type ChatItem, type Message, type Stop } from './transcriptModel'
import { firstChar, stageLabel, type T } from './transcriptText'

// As the student's own timeline does (SoloTimeline): within this far of the bottom the reader is "at the bottom".
const FOLLOW_LATEST_THRESHOLD = 96
// The reader is "in" the scenario whose start has scrolled past this share of the view's height from the top.
const VIEW_LINE = 0.3
// A jump's scrolling is not the reader's: it is ignored until the browser says it stopped, or after this long where it does not say.
const JUMP_SETTLE_MS = 1000

/** Where a jump lands. Written as one function so a later one can aim at a sentence instead of a scenario's start. */
export function scrollToTarget(container: HTMLElement, target: HTMLElement) {
  // Smooth, so the reader sees how far the scenario was and which way; not for whoever asked their system for less motion.
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
  container.scrollTo({ top: Math.max(0, target.offsetTop - 12), behavior: reduced ? 'auto' : 'smooth' })
}

// Where each stop starts in the chat: a scenario's board, and the review's section once it has begun.
const STOP_STARTS = '[data-scenario], [data-review]'
const stopOf = (start: HTMLElement): Stop => start.dataset.review !== undefined ? 'review' : Number(start.dataset.scenario)
const stopSelector = (stop: Stop) => stop === 'review' ? '[data-review]' : `[data-scenario="${stop}"]`

/** The stop the reader is in: the last one whose start is above the view line; at the bottom, the latest one. */
function stopInView(container: HTMLElement, atBottom: boolean): Stop | null {
  const starts = Array.from(container.querySelectorAll<HTMLElement>(STOP_STARTS))
  if (starts.length === 0) return null
  if (atBottom) return stopOf(starts[starts.length - 1])
  const line = container.scrollTop + container.clientHeight * VIEW_LINE
  let found = starts[0]
  for (const start of starts) if (start.offsetTop <= line) found = start
  return stopOf(found)
}

export type ChatHandle = { jumpTo(stop: Stop): void }

type Props = { attempt: Attempt; studentName: string; footer: string; onViewing?(stop: Stop): void }

export const TranscriptChat = forwardRef<ChatHandle, Props>(function TranscriptChat({ attempt, studentName, footer, onViewing }, ref) {
  const { t, locale } = useT('teach')
  const scroller = useRef<HTMLDivElement>(null)
  const atBottom = useRef(true)
  const seen = useRef<Set<string>>(new Set())
  const [unseen, setUnseen] = useState(0)
  const items = buildChat(attempt)
  const ids = messageIds(items)
  // A card or a system line can arrive without a message, and the reader at the bottom should follow that too.
  const growthKey = items.map(item => item.key).join(':')

  // While a jump scrolls, the stop that was clicked stays the viewed one: the chat cannot always bring a short last
  // scenario to the top, and the frames on the way pass over scenarios nobody asked for.
  const jumping = useRef(false)
  const settle = useRef<number | undefined>(undefined)
  function endJump() {
    jumping.current = false
    window.clearTimeout(settle.current)
  }
  useEffect(() => {
    const container = scroller.current
    container?.addEventListener('scrollend', endJump)
    return () => { container?.removeEventListener('scrollend', endJump); window.clearTimeout(settle.current) }
  }, [])

  useImperativeHandle(ref, () => ({
    jumpTo(stop) {
      const container = scroller.current
      const target = container?.querySelector<HTMLElement>(stopSelector(stop))
      if (!container || !target) return
      onViewing?.(stop)
      jumping.current = true
      window.clearTimeout(settle.current)
      settle.current = window.setTimeout(endJump, JUMP_SETTLE_MS)
      scrollToTarget(container, target)
    },
  }))

  function toBottom() {
    const container = scroller.current
    if (container) container.scrollTop = container.scrollHeight
  }

  // Whoever is at the bottom follows the new messages; whoever scrolled up is left where they are and told how many came.
  useLayoutEffect(() => {
    if (atBottom.current) {
      toBottom()
      seen.current = new Set(ids)
      setUnseen(0)
    } else {
      setUnseen(ids.filter(id => !seen.current.has(id)).length)
    }
  }, [growthKey])

  function onScroll() {
    const container = scroller.current
    if (!container) return
    atBottom.current = container.scrollHeight - container.scrollTop - container.clientHeight <= FOLLOW_LATEST_THRESHOLD
    if (atBottom.current) {
      seen.current = new Set(ids)
      setUnseen(0)
    }
    if (!jumping.current) {
      const viewing = stopInView(container, atBottom.current)
      if (viewing !== null) onViewing?.(viewing)
    }
  }

  function showNew() {
    atBottom.current = true
    toBottom()
    seen.current = new Set(ids)
    setUnseen(0)
  }

  const stage = stageLabel(t as T, stageOf(attempt))
  const time = (message: Message) => formatDateTime(message.created_at, locale, 'time')
  const system = (text: string, key: string) => <p key={key} className="tc-system"><strong>{t('transcript.system')}</strong>{text}</p>

  function render(item: ChatItem) {
    switch (item.kind) {
      case 'scenario': {
        const first = item.index === 0
        const scenario = attempt.scenarios[item.index]
        return <div key={item.key} data-scenario={item.index} className="tc-scenario">
          <span className="tc-label">{item.name ? t('transcript.scenarioNamed', { number: item.index + 1, name: item.name }) : t('transcript.scenarioLabel', { number: item.index + 1 })}</span>
          <section className="tc-board" aria-label={t(first ? 'transcript.boardFirst' : 'transcript.boardNext')}>
            <p className="tc-board__title">{t(first ? 'transcript.boardFirst' : 'transcript.boardNext')}</p>
            <p>{item.text}</p>
            {scenario?.change && <p className="tc-board__change">{t('transcript.boardChange', { condition: scenario.change.condition, before: scenario.change.before, after: scenario.change.after })}</p>}
          </section>
        </div>
      }
      case 'message': {
        const { message } = item
        if (message.role === 'student') {
          return <div key={item.key} className="tc-row tc-row--student">
            <div className="tc-line">
              <time className="tc-time">{time(message)}</time>
              <p className="tc-bubble tc-bubble--student">{message.text}</p>
            </div>
            <span className="tc-avatar tc-avatar--student" aria-hidden="true">{firstChar(studentName)}</span>
          </div>
        }
        return <div key={item.key} className="tc-row tc-row--tutor">
          <span className="tc-avatar tc-avatar--tutor" aria-hidden="true">{t('transcript.socratesMark')}</span>
          <div className="tc-tutor">
            <span className="tc-tutor__name">{t('transcript.socrates')}</span>
            <p className="tc-bubble tc-bubble--tutor">{message.text}</p>
          </div>
        </div>
      }
      case 'reject':
        return system(item.reason
          ? t('transcript.sys.rejectReason', { name: studentName, reason: t(`transcript.reason.${item.reason}`) })
          : t('transcript.sys.reject', { name: studentName }), item.key)
      case 'rejectFinal': return system(t('transcript.sys.reject', { name: studentName }), item.key)
      case 'confirm': return system(t('transcript.sys.confirm', { name: studentName }), item.key)
      case 'budget': return system(t('transcript.sys.budget', { name: studentName }), item.key)
      case 'pending': return <PendingSummary key={item.key} summary={item.summary} scenarioNumber={attempt.scenario_index + 1} />
      case 'review': return <div key={item.key} data-review=""><ReviewSection attempt={attempt} /></div>
    }
  }

  return <section className="transcript-chat" aria-label={t('transcript.chatLabel', { name: studentName })}>
    <header className="transcript-chat__head">
      <span className="tc-avatar tc-avatar--gold" aria-hidden="true">{firstChar(studentName)}</span>
      <h2>{t('transcript.chatTitle', { name: studentName })}</h2>
      <span className={stage.className}>{stage.label}</span>
    </header>
    <div className="transcript-chat__body">
      <div ref={scroller} className="transcript-chat__scroll" data-testid="transcript-scroll" onScroll={onScroll}>
        {items.map(render)}
      </div>
      {unseen > 0 && <button type="button" className="transcript-chat__new" onClick={showNew}>{t('transcript.newContent', { count: unseen })}</button>}
    </div>
    <footer className="transcript-chat__foot">{footer}</footer>
  </section>
})
