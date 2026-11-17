import { useRef, useState } from 'react'
import { useT } from '../../i18n/useT'
import { clearSoloDraft, readSoloDraft, soloDraftKey, writeSoloDraft } from './soloDraft'
import { can, type SoloAttemptView, type SoloSendMessageBody } from './soloView'
import { useSoloSpeechInput } from './useSoloSpeechInput'

type Props = {
  view: SoloAttemptView
  pending: boolean
  sending?: boolean
  onSend(body: SoloSendMessageBody): Promise<boolean>
}

export function SoloComposer({ view, pending, sending = false, onSend }: Props) {
  const { t, locale } = useT('solo')
  const draftKey = soloDraftKey(view.id, view.scenario_index)
  const [text, setText] = useState(() => readSoloDraft(draftKey))
  const [reviseHint, setReviseHint] = useState<NonNullable<SoloSendMessageBody['revise_hint']> | null>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const canSend = can(view, 'send_message')
  const speech = useSoloSpeechInput(locale, transcript => {
    const next = text.trimEnd() ? `${text.trimEnd()} ${transcript}` : transcript
    updateText(next)
  })

  // A1w: while the tutor is thinking the composer stays, disabled, saying the message is stored.
  const awaiting = view.state === 'awaiting_tutor'
  // The first message of a scenario is the student's own answer, in the same box.
  const answering = view.state === 'answering'
  // X2: the retry lives in the conversation; here only a note that answering resumes later.
  if (view.state === 'tutor_unavailable') {
    return <section className="solo-composer"><p className="solo-composer__paused">{t('composer.unavailablePlaceholder')}</p></section>
  }

  if (!canSend && !awaiting) return null

  const disabled = pending || !canSend
  async function submit() {
    const message = text.trim()
    if (!message || disabled) return
    const body: SoloSendMessageBody = { text: message }
    if (view.revising && reviseHint) body.revise_hint = reviseHint
    const sent = await onSend(body)
    if (sent) {
      clearSoloDraft(draftKey)
      setText('')
      // The composer outlives the confirmation that follows; a later 不太對 starts fresh.
      setReviseHint(null)
    }
  }

  function updateText(next: string) {
    setText(next)
    writeSoloDraft(draftKey, next)
  }

  const quick: Array<{ value: NonNullable<SoloSendMessageBody['revise_hint']>; label: string }> = [
    { value: 'stance', label: t('revise.quickPosition') },
    { value: 'reason', label: t('revise.quickReason') },
    { value: 'condition', label: t('revise.quickConditions') },
    { value: 'changed_mind', label: t('revise.quickChanged') },
  ]
  function chooseHint(value: NonNullable<SoloSendMessageBody['revise_hint']>) {
    const next = reviseHint === value ? null : value
    setReviseHint(next)
    // A quick option only adds structured metadata. Keep the student's own words intact and
    // put the cursor back where they were writing.
    window.requestAnimationFrame(() => {
      const input = inputRef.current
      if (!input) return
      input.focus()
      input.setSelectionRange(input.value.length, input.value.length)
    })
  }

  const selectedHint = quick.find(option => option.value === reviseHint)?.label
  const sendDisabled = disabled || !text.trim()

  return <section className="solo-composer">
    {view.revising && canSend && <div className="solo-composer__quick" role="group" aria-label={t('revise.quickLabel')}>
      <strong>{t('revise.quickPrompt')}</strong>
      {quick.map(option => <button
        key={option.value}
        type="button"
        className="solo-chip"
        aria-pressed={reviseHint === option.value}
        disabled={disabled}
        onClick={() => chooseHint(option.value)}
      >{reviseHint === option.value && <span aria-hidden="true">✓</span>}{option.label}</button>)}
    </div>}
    <label htmlFor="solo-answer">{view.revising ? t('revise.label') : answering ? t('composer.answerLabel') : t('composer.label')}</label>
    <div className="solo-composer__entry">
      <textarea
        ref={inputRef}
        id="solo-answer"
        value={text}
        maxLength={4000}
        disabled={disabled}
        placeholder={disabled ? t('composer.waitingPlaceholder') : answering ? t('composer.answerPlaceholder') : t('composer.placeholder')}
        onChange={event => updateText(event.target.value)}
      />
      {speech.supported && <button
        className="solo-composer__voice"
        type="button"
        aria-label={speech.recording ? t('composer.stopVoice') : t('composer.voice')}
        aria-pressed={speech.recording}
        disabled={disabled}
        onClick={speech.toggle}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>
      </button>}
      {canSend && <button className="solo-composer__send" type="button" aria-label={t('composer.send')} disabled={sendDisabled} onClick={() => { void submit() }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 19V5M6 11l6-6 6 6" /></svg>
      </button>}
    </div>
    <p className="solo-composer__hint">{sending
      ? t('composer.sendingHint')
      : pending || awaiting
        ? t('composer.savedHint')
        : selectedHint
          ? t('revise.selectedHint', { option: selectedHint })
          : view.revising ? t('revise.hint') : answering ? t('composer.answerHint') : t('composer.hint')}</p>
  </section>
}
