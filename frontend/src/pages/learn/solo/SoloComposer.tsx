import { useRef, useState } from 'react'
import { useT } from '../../../i18n/useT'
import { clearSoloDraft, readSoloDraft, soloDraftKey, writeSoloDraft } from './soloDraft'
import { can, optionLetter, type SoloAttemptView, type SoloSendMessageBody } from './soloView'
import { useSoloSpeechInput } from './useSoloSpeechInput'

type Props = {
  view: SoloAttemptView
  pending: boolean
  sending?: boolean
  onSend(body: SoloSendMessageBody): Promise<boolean>
}

export function SoloComposer({ view, pending, sending = false, onSend }: Props) {
  const { t, locale } = useT('solo')
  const draftKey = soloDraftKey(view.id, view.question_index, 'composer')
  const [text, setText] = useState(() => readSoloDraft(draftKey))
  const [reviseHint, setReviseHint] = useState<NonNullable<SoloSendMessageBody['revise_hint']> | null>(null)
  const [newOptionId, setNewOptionId] = useState<string | null>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const canSend = can(view, 'send_message')
  const question = view.questions.find(item => item.index === view.question_index)
  const currentOptionId = question?.stance?.current_option_id ?? null
  const speech = useSoloSpeechInput(locale, transcript => {
    const next = text.trimEnd() ? `${text.trimEnd()} ${transcript}` : transcript
    updateText(next)
  })

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
    if (!message || disabled || (reviseHint === 'changed_mind' && !newOptionId)) return
    const body: SoloSendMessageBody = { text: message }
    if (view.revising && reviseHint) body.revise_hint = reviseHint
    if (view.revising && reviseHint === 'changed_mind' && newOptionId) body.new_option_id = newOptionId
    const sent = await onSend(body)
    if (sent) {
      clearSoloDraft(draftKey)
      setText('')
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
    setNewOptionId(null)
    // A quick option only adds structured metadata. Keep the student's own words intact and
    // put the cursor back where they were writing.
    window.requestAnimationFrame(() => {
      const input = inputRef.current
      if (!input) return
      input.focus()
      input.setSelectionRange(input.value.length, input.value.length)
    })
  }

  const changedMind = reviseHint === 'changed_mind'
  const newOptions = question?.options.filter(option => option.id !== currentOptionId) ?? []
  const selectedHint = quick.find(option => option.value === reviseHint)?.label
  const sendDisabled = disabled || !text.trim() || (changedMind && !newOptionId)

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
    {view.revising && canSend && changedMind && question && <fieldset className="solo-composer__new-stance" disabled={disabled}>
      <legend>{t('revise.newStance')}</legend>
      <p>{t('revise.originalStance')}</p>
      <div className="solo-stance__options">
        {newOptions.map(option => {
          const index = question.options.findIndex(item => item.id === option.id)
          return <button
            key={option.id}
            type="button"
            className="solo-stance__option"
            data-option={optionLetter(index)}
            aria-pressed={newOptionId === option.id}
            onClick={() => setNewOptionId(option.id)}
          ><span>{optionLetter(index)}</span>{option.text}</button>
        })}
      </div>
    </fieldset>}
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
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
      </button>}
    </div>
    <p className="solo-composer__hint">{sending
      ? t('composer.sendingHint')
      : pending || awaiting
        ? t('composer.savedHint')
        : changedMind && !newOptionId
          ? t('revise.chooseNewHint')
          : selectedHint
            ? t('revise.selectedHint', { option: selectedHint })
            : view.revising ? t('revise.hint') : t('composer.hint')}</p>
  </section>
}
