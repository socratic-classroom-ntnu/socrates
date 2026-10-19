import { useRef, useState } from 'react'
import { useT } from '../../../i18n/useT'
import { clearSoloDraft, readSoloDraft, soloDraftKey, writeSoloDraft } from './soloDraft'
import { can, type SoloAttemptView } from './soloView'

type Props = {
  view: SoloAttemptView
  pending: boolean
  sending?: boolean
  onSend(text: string): Promise<boolean>
}

export function SoloComposer({ view, pending, sending = false, onSend }: Props) {
  const { t, locale } = useT('solo')
  const draftKey = soloDraftKey(view.id, view.question_index, 'composer')
  const [text, setText] = useState(() => readSoloDraft(draftKey))
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const canSend = can(view, 'send_message')

  // A1w: while the tutor is thinking the composer stays, disabled, saying the message is stored.
  const awaiting = view.state === 'awaiting_tutor'
  // X2: the retry lives in the conversation; here only a note that answering resumes later.
  if (view.state === 'tutor_unavailable') {
    return <section className="solo-composer"><p className="solo-composer__paused">{t('composer.unavailablePlaceholder')}</p></section>
  }

  if (!canSend && !awaiting) return null

  const disabled = pending || !canSend
  async function submit() {
    const message = text.trim()
    if (!message || disabled) return
    const sent = await onSend(message)
    if (sent) {
      clearSoloDraft(draftKey)
      setText('')
    }
  }

  function updateText(next: string) {
    setText(next)
    writeSoloDraft(draftKey, next)
  }

  // X1: a quick option only starts the sentence; the student finishes it and sends it.
  const quick = [t('revise.quickPosition'), t('revise.quickReason'), t('revise.quickConditions')]
  const end = locale.startsWith('zh') ? '。' : '. '
  function startWith(option: string) {
    const rest = quick.reduce((current, label) => current.startsWith(label + end) ? current.slice((label + end).length) : current, text)
    const next = option + end + rest
    updateText(next)
    // Keep writing right after the chosen opening.
    window.requestAnimationFrame(() => {
      const input = inputRef.current
      if (!input) return
      input.focus()
      input.setSelectionRange(next.length, next.length)
    })
  }

  return <section className="solo-composer">
    {view.revising && canSend && <div className="solo-composer__quick" role="group" aria-label={t('revise.quickLabel')}>
      {quick.map(option => <button key={option} type="button" className="solo-chip" disabled={disabled} onClick={() => startWith(option)}>{option}</button>)}
    </div>}
    <label htmlFor="solo-answer">{view.revising ? t('revise.label') : t('composer.label')}</label>
    <div className="solo-composer__entry">
      <textarea
        ref={inputRef}
        id="solo-answer"
        value={text}
        maxLength={4000}
        disabled={disabled}
        placeholder={disabled ? t('composer.waitingPlaceholder') : t('composer.placeholder')}
        onChange={event => updateText(event.target.value)}
      />
      {canSend && <button className="solo-composer__send" type="button" aria-label={t('composer.send')} disabled={disabled || !text.trim()} onClick={() => { void submit() }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
      </button>}
    </div>
    <p className="solo-composer__hint">{sending ? t('composer.sendingHint') : pending || awaiting ? t('composer.savedHint') : view.revising ? t('revise.hint') : t('composer.hint')}</p>
  </section>
}
