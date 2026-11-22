import { Button, ButtonLink } from '../../../../ui'
import { useT } from '../../../../i18n/useT'

type Kind = 'notStarted' | 'loading' | 'failed' | 'notFound'

/** The three non-conversation screens of Figma 09, 10, 11 (404 is 11 with only the way back). */
export function TranscriptState({ kind, backTo, onRetry }: { kind: Kind; backTo: string; onRetry?: () => void }) {
  const { t } = useT('teach')
  const title = kind === 'notStarted' ? 'notStartedTitle' : kind === 'loading' ? 'loadingTitle' : 'failedTitle'
  const body = kind === 'notStarted' ? 'notStartedBody' : kind === 'loading' ? 'loadingBody' : kind === 'notFound' ? 'notFoundBody' : 'failedBody'
  return <section className="transcript-state" role={kind === 'failed' || kind === 'notFound' ? 'alert' : undefined} aria-busy={kind === 'loading' ? 'true' : undefined}>
    <StateIcon kind={kind} />
    <h2>{t(`transcript.states.${title}`)}</h2>
    <p>{t(`transcript.states.${body}`)}</p>
    {kind !== 'loading' && <div className="transcript-state__actions">
      {kind === 'failed' && onRetry && <Button variant="primary" onClick={onRetry}>{t('transcript.states.retry')}</Button>}
      <ButtonLink variant="outline" to={backTo}>{t('transcript.back')}</ButtonLink>
    </div>}
  </section>
}

/** The pictures of Figma 09 (a chat with a slash), 10 (a ring) and 11 (a warning triangle). */
function StateIcon({ kind }: { kind: Kind }) {
  if (kind === 'loading') return <span className="transcript-state__icon transcript-state__icon--loading" aria-hidden="true" />
  return <svg className="transcript-state__icon" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    {kind === 'notStarted'
      ? <><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-4.3A8 8 0 1 1 21 12Z" /><path d="M4 4l16 16" /></>
      : <><path d="M12 3.5 2.5 20h19L12 3.5Z" /><path d="M12 10v4.5" /><path d="M12 17.3v.2" /></>}
  </svg>
}
