import { useState, type FormEvent } from 'react'
import { useT } from '../../../i18n/useT'
import { clearSoloDraft, readSoloDraft, soloDraftKey, writeSoloDraft } from './soloDraft'
import { can, optionLetter, type SoloAttemptView, type SoloQuestion } from './soloView'

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
  const { t } = useT('solo')
  const draftKey = soloDraftKey(view.id, question.index, 'stance')
  const [initialDraft] = useState(() => readStanceDraft(draftKey, question))
  const [optionId, setOptionId] = useState(initialDraft.optionId)
  const [reason, setReason] = useState(initialDraft.reason)
  const [busy, setBusy] = useState(false)
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
      <button className="solo-primary" type="submit" disabled={!selected || !reason.trim() || busy}>{t('stance.submit')}</button>
    </fieldset>
    <p className="solo-stance__hint">{t('stance.hint')}</p>
  </form>
}
