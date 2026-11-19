import { forwardRef, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react'
import { formatDateTime } from '../../../../i18n/format'
import { useT } from '../../../../i18n/useT'
import { PendingSummary, ReviewSection } from './TranscriptCards'
import { buildChat, messageIds, stageOf, type Attempt, type ChatItem, type Message } from './transcriptModel'
import { firstChar, stageLabel, type T } from './transcriptText'

// As the student's own timeline does (SoloTimeline): within this far of the bottom the reader is "at the bottom".
const FOLLOW_LATEST_THRESHOLD = 96

/** Where a jump lands. Written as one function so a later one can aim at a sentence instead of a scenario's start. */
export function scrollToTarget(container: HTMLElement, target: HTMLElement) {
  container.scrollTop = Math.max(0, target.offsetTop - 12)
}

export type ChatHandle = { jumpToScenario(index: number): void }

type Props = { attempt: Attempt; studentName: string; footer: string }

export const TranscriptChat = forwardRef<ChatHandle, Props>(function TranscriptChat({ attempt, studentName, footer }, ref) {
  const { t, locale } = useT('teach')
  const scroller = useRef<HTMLDivElement>(null)
  const atBottom = useRef(true)
  const seen = useRef<Set<string>>(new Set())
  const [unseen, setUnseen] = useState(0)
  const items = buildChat(attempt)
  const ids = messageIds(items)
  const idKey = ids.join(':')

  useImperativeHandle(ref, () => ({
    jumpToScenario(index) {
      const container = scroller.current
      const target = container?.querySelector<HTMLElement>(`[data-scenario="${index}"]`)
      if (container && target) scrollToTarget(container, target)
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
  }, [idKey])

  function onScroll() {
    const container = scroller.current
    if (!container) return
    atBottom.current = container.scrollHeight - container.scrollTop - container.clientHeight <= FOLLOW_LATEST_THRESHOLD
    if (atBottom.current) {
      seen.current = new Set(ids)
      setUnseen(0)
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
      case 'review': return <ReviewSection key={item.key} attempt={attempt} />
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
