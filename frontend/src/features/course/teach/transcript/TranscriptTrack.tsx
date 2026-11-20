import { useT } from '../../../../i18n/useT'
import type { Attempt } from './transcriptModel'
import { buildTrack, stageOf } from './transcriptModel'
import { stageLabel, type T } from './transcriptText'
import { Written } from './TranscriptCards'

/** The right column: one stop per scenario the student has reached, then the review once it begins (Figma 03–12). */
export function TranscriptTrack({ attempt, name, onJump }: { attempt: Attempt; name: string; onJump(index: number): void }) {
  const { t } = useT('teach')
  const rows = buildTrack(attempt)
  const done = rows.filter(row => row.status === 'confirmed').length
  const inReview = attempt.review_status !== 'not_started'

  return <aside className="transcript-track" aria-label={t('transcript.trackTitle', { name })}>
    <h2>{t('transcript.trackTitle', { name })}</h2>
    {rows.length > 1 || inReview ? <p className="tt-progress">{t('transcript.trackProgress', { done, total: rows.length })}</p> : null}
    <ol className="tt-list">
      {rows.map(row => {
        const label = stageLabel(t as T, { kind: 'cell', status: row.status, turns: row.turns })
        return <li key={row.index} className={`tt-row${row.current ? ' tt-row--current' : ''}`} aria-current={row.current ? 'step' : undefined}>
          <button type="button" className="tt-row__button" onClick={() => onJump(row.index)}>
            <span className="tt-row__head">
              <strong>{t('transcript.scenarioLabel', { number: row.index + 1 })}</strong>
              <span className={label.className}>{label.label}</span>
            </span>
            <span className="tt-row__name">{row.name}</span>
            {row.status === 'confirmed' && row.stance !== null && <span className="tt-row__stance"><Written text={row.stance} /></span>}
            {row.status === 'confirming' && <>
              {row.cappedConfirming && <span className="tt-row__tag">{t('transcript.track.cappedEnd')}</span>}
              <span className="tt-row__stance">{row.cappedConfirming ? t('transcript.summary.title') : t('transcript.track.awaiting', { name })}</span>
              {row.cappedConfirming
                ? <span className="tt-row__note">{t('transcript.track.cappedWait', { name })}</span>
                : row.stance !== null && <span className="tt-row__note">{t('transcript.track.discussing', { stance: row.stance.trim() === '' ? t('transcript.blank') : row.stance })}</span>}
            </>}
            {(row.status === 'in_dialogue' || row.status === 'answering') && <span className="tt-row__note">{t('transcript.track.noStance')}</span>}
            {row.rejections > 0 && <span className="tt-row__warn">{t('transcript.track.rejected', { count: row.rejections })}</span>}
            <span className="sr-only">{t('transcript.track.jump', { number: row.index + 1 })}</span>
          </button>
        </li>
      })}
      {inReview && <ReviewRow attempt={attempt} />}
    </ol>
  </aside>
}

function ReviewRow({ attempt }: { attempt: Attempt }) {
  const { t } = useT('teach')
  const stage = stageOf(attempt)
  const label = stageLabel(t as T, stage)
  const unconfirmed = stage.kind === 'review' && stage.key === 'unconfirmed'
  const completed = stage.kind === 'review' && stage.key === 'completed'
  const line = unconfirmed ? 'reviewUnconfirmed' : completed ? (attempt.final_summary ? 'reviewConfirmed' : 'reviewNone') : 'reviewInProgress'
  return <li className={`tt-row tt-row--current${unconfirmed ? ' tt-row--warn' : ''}`}>
    <span className="tt-row__button tt-row__button--static">
      <span className="tt-row__head"><strong>{t('transcript.track.review')}</strong><span className={label.className}>{label.label}</span></span>
      <span className="tt-row__note">{t(`transcript.track.${line}`)}</span>
    </span>
  </li>
}
