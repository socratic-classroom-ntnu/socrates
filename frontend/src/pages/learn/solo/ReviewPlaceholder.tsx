import { useT } from '../../../i18n/useT'
import { can, type SoloAttemptView } from './soloView'

/** A3b bottom bar, where the composer was: every question is confirmed; the review (R1) is
 * not built yet, so 開始回顧 stays disabled and never posts submit_review. */
export function ReviewPlaceholder({ view }: { view: SoloAttemptView }) {
  const { t } = useT('solo')
  return <section className="solo-review" aria-labelledby="solo-review-title">
    <div>
      <h2 id="solo-review-title">{t('review.title')}</h2>
      <p>{t('review.subtitle')}</p>
    </div>
    <div className="solo-review__action">
      {can(view, 'submit_review') && <button className="solo-review__start" type="button" disabled>{t('review.start')} <span aria-hidden="true">→</span></button>}
      <span>{t('review.comingSoon')}</span>
    </div>
  </section>
}
