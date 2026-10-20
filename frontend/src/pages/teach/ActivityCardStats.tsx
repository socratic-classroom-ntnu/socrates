import type { components } from '../../api/classroomTypes'
import { useResource } from '../../api/useResource'
import { useT } from '../../i18n/useT'

type CardStatus = components['schemas']['ActivityTeacherCard']['status']
type Progress = components['schemas']['SoloActivityProgressView']

function percent(value: number, total: number) {
  if (total <= 0) return 0
  return Math.min(100, Math.round((value / total) * 100))
}

function Stat({ label, value, total }: { label: string; value: number; total: number }) {
  return <span className="activity-card-stat">
    <span className="activity-card-stat__text">{label}</span>
    <span className="activity-card-stat__track" aria-hidden="true">
      <span className="activity-card-stat__fill" style={{ width: `${percent(value, total)}%` }} />
    </span>
  </span>
}

export function ActivityCardStats({ activityId, status }: { activityId: string; status: CardStatus }) {
  const { t } = useT('teach')
  const readsProgress = status === 'open' || status === 'ended'
  const progress = useResource<Progress>(readsProgress ? `/solo/activities/${activityId}/progress` : null)

  if (status === 'draft') return <>{t('cards.hidden')}</>
  if (status === 'scheduled') return <>{t('cards.notYetOpen')}</>
  if (!progress.data) return null

  const { enrolled, started, done } = progress.data.summary
  return <div className="activity-card-stats">
    {status === 'open' && <Stat label={t('cards.started', { started, enrolled })} value={started} total={enrolled} />}
    <Stat label={t('cards.done', { done, enrolled })} value={done} total={enrolled} />
  </div>
}
