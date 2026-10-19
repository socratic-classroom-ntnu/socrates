import { useState, type FormEvent } from 'react'
import { useT } from '../../../i18n/useT'
import { clearSoloDraft, readSoloDraft, soloDraftKey, writeSoloDraft } from './soloDraft'
import { can, optionLetter, type SoloAttemptView, type SoloQuestion } from './soloView'
import { useSoloSpeechInput } from './useSoloSpeechInput'

type StanceDraft = { optionId: string; reason: string }

function readStanceDraft(key: string, question: SoloQuestion): StanceDraft {
  try {
    const parsed = JSON.parse(readSoloDraft(key)) as Partial<StanceDraft>
    const optionId = typeof parsed.optionId === 'string' && question.options.some(option => option.id === parsed.optionId)
      ? parsed.optionId
      : ''
    return { optionId, reason: typeof parsed.reason === 'string' ? parsed.reason : '' }
  } catch {
    return { optionId: '', reason: '' }
  }
}

export function StanceForm({ view, question, onSubmit }: {
  view: SoloAttemptView
  question: SoloQuestion
  onSubmit(optionId: string, reason: string): Promise<boolean>
}) {
  const { t, locale } = useT('solo')
  const draftKey = soloDraftKey(view.id, question.index, 'stance')
  const [initialDraft] = useState(() => readStanceDraft(draftKey, question))
  const [optionId, setOptionId] = useState(initialDraft.optionId)
  const [reason, setReason] = useState(initialDraft.reason)
  const [busy, setBusy] = useState(false)
  const speech = useSoloSpeechInput(locale, transcript => {
    const next = reason.trimEnd() ? `${reason.trimEnd()} ${transcript}` : transcript
    setReason(next)
    saveDraft(optionId, next)
  })
  if (!can(view, 'submit_stance')) return null
  const selected = question.options.find(option => option.id === optionId)

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!selected || !reason.trim() || busy) return
    setBusy(true)
    try {
      const sent = await onSubmit(selected.id, reason.trim())
      if (sent) clearSoloDraft(draftKey)
    } finally {
      setBusy(false)
    }
  }

  function saveDraft(nextOptionId: string, nextReason: string) {
    writeSoloDraft(draftKey, JSON.stringify({ optionId: nextOptionId, reason: nextReason }))
  }

  return <form className="solo-stance" onSubmit={submit}>
    <fieldset disabled={busy}>
      <legend>{t('stance.title')}</legend>
      <div className="solo-stance__options">
        {question.options.map((option, index) => <button
          key={option.id}
          type="button"
          className="solo-stance__option"
          data-option={optionLetter(index)}
          aria-pressed={option.id === optionId}
          onClick={() => {
            setOptionId(option.id)
            saveDraft(option.id, reason)
          }}
        ><span>{optionLetter(index)}</span>{option.text}</button>)}
      </div>
      <label htmlFor="solo-stance-reason">{t('stance.why')}</label>
      <div className="solo-stance__entry">
        <textarea
          id="solo-stance-reason"
          value={reason}
          maxLength={4000}
          required
          placeholder={selected ? t('stance.placeholder', { option: selected.text }) : t('stance.chooseFirst')}
          onChange={event => {
            setReason(event.target.value)
            saveDraft(optionId, event.target.value)
          }}
        />
        {speech.supported && <button
          className="solo-composer__voice"
          type="button"
          aria-label={speech.recording ? t('composer.stopVoice') : t('composer.voice')}
          aria-pressed={speech.recording}
          disabled={busy}
          onClick={speech.toggle}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>
        </button>}
        <button className="solo-stance__send" type="submit" aria-label={t('stance.submit')} disabled={!selected || !reason.trim() || busy}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
        </button>
      </div>
    </fieldset>
    <p className="solo-stance__hint">{t('stance.hint')}</p>
  </form>
}
