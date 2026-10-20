import { useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ApiError, api } from '../../api/classroomClient'
import type { components } from '../../api/classroomTypes'
import { useResource } from '../../api/useResource'
import { Dialog } from '../../components/Dialog'
import { Menu, type MenuItem } from '../../components/Menu'
import { errorCode, errorMessage } from '../../i18n/errors'
import { formatDateTime } from '../../i18n/format'
import { useT } from '../../i18n/useT'
import { ActivityCardStats } from './ActivityCardStats'
import { DeleteActivityDialog } from './DeleteActivityDialog'
import { InviteDialog } from './InviteDialog'

type Card = components['schemas']['ActivityTeacherCard']
type List = components['schemas']['ActivityTeacherList']
type Action = Card['available_actions'][number]
type Filter = 'all' | 'open' | 'upcoming' | 'ended'

const FILTERS: Record<Filter, (status: Card['status']) => boolean> = {
  all: () => true,
  open: status => status === 'open',
  upcoming: status => status === 'draft' || status === 'scheduled',
  ended: status => status === 'ended',
}
const isFilter = (value: string | null): value is Filter => value !== null && value in FILTERS

type Confirm = { kind: 'end' | 'cancel' | 'delete'; card: Card }

/** T4: filter chips and activity cards; every state change is gated by the card's available_actions. */
export function ActivityCards({ courseId, canCreate }: { courseId: string; canCreate: boolean }) {
  const { t, locale } = useT('teach')
  const navigate = useNavigate()
  const list = useResource<List>(`/courses/${courseId}/activities?role=teacher`)
  const [params, setParams] = useSearchParams()
  const raw = params.get('filter')
  const filter: Filter = isFilter(raw) ? raw : 'all'
  const [notice, setNotice] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<Confirm | null>(null)
  const [inviting, setInviting] = useState<Card | null>(null)
  // 一張卡同時只送一個動作：連點「開始活動」不會送兩次（ref 擋同一個 tick 內的第二下）
  const [working, setWorking] = useState<string | null>(null)
  const workingRef = useRef<string | null>(null)

  if (list.loading && !list.data) return <div aria-busy="true" />
  if (!list.data) return <p role="alert" className="form-error">{errorMessage(t, list.error)}</p>
  if (list.data.items.length === 0) return <EmptyActivities courseId={courseId} canCreate={canCreate} />

  const items = list.data.items
  const when = (seconds: number | null, style: Parameters<typeof formatDateTime>[2]) => seconds === null ? '' : formatDateTime(seconds, locale, style)

  async function failed(error: unknown) {
    const code = errorCode(error)
    if ((error instanceof ApiError && error.status === 404) || code === 'ACTIVITY_ACTION_UNAVAILABLE') {
      await list.reload()
      setNotice(t('cards.stale'))
    } else if (code === 'ACTIVITY_TIME_INVALID') {
      setNotice(t('cards.timeInvalid'))
    } else {
      setNotice(errorMessage(t, error))
    }
  }

  async function busyWith(card: Card, work: () => Promise<void>) {
    if (workingRef.current) return
    workingRef.current = card.id
    setWorking(card.id)
    setNotice(null)
    try {
      await work()
    } catch (error) {
      await failed(error)
    } finally {
      workingRef.current = null
      setWorking(null)
    }
  }

  function transition(card: Card, action: 'start_now' | 'publish' | 'end_now') {
    return busyWith(card, async () => {
      await api(`/activities/${card.id}/${action}`, 'POST')
      await list.reload()
    })
  }

  function copy(card: Card) {
    return busyWith(card, async () => {
      const created: components['schemas']['ActivityTeacherView'] = await api(`/activities/${card.id}/copy`, 'POST')
      navigate(`/teach/activities/${created.id}/edit`, { state: { copiedFrom: card.title } })
    })
  }

  function menuItems(card: Card): MenuItem[] {
    const can = (action: Action) => card.available_actions.includes(action)
    const editable = can('update') || can('update_details')
    const entry = (key: string, show: boolean, onSelect: () => void): MenuItem[] =>
      show ? [{ key, label: t(`cards.menu.${key}`), onSelect }] : []
    const qr = entry('qr', true, () => setInviting(card))
    const analysis = entry('analysis', true, () => navigate(`/teach/activities/${card.id}/analysis`))
    const edit = entry('edit', editable, () => navigate(`/teach/activities/${card.id}/edit`))
    const duplicate = entry('copy', can('copy'), () => void copy(card))
    const byStatus: Record<Card['status'], MenuItem[]> = {
      open: [...qr, ...analysis, ...edit, ...duplicate, ...entry('endEarly', can('end_now'), () => setConfirm({ kind: 'end', card }))],
      scheduled: [...qr, ...edit, ...entry('cancelSchedule', can('end_now'), () => setConfirm({ kind: 'cancel', card })), ...duplicate],
      draft: [...edit, ...entry('publish', can('publish'), () => void transition(card, 'publish')), ...duplicate],
      ended: [...analysis, ...duplicate],
    }
    const remove = can('delete') ? [{ key: 'delete', label: t('cards.menu.delete'), danger: true, dividerBefore: true, onSelect: () => setConfirm({ kind: 'delete', card }) }] : []
    return [...byStatus[card.status], ...remove]
  }

  function meta(card: Card) {
    const questions = t('cards.questions', { count: card.question_count })
    if (card.status === 'draft') return t('cards.draftMeta', { questions, end: when(card.ends_at, 'dateTime') })
    if (card.status === 'scheduled') return t('cards.scheduledMeta', { questions, start: when(card.starts_at, 'weekdayDateTime'), end: when(card.ends_at, 'dateTime') })
    if (card.status === 'open') return t('cards.openMeta', { questions, end: when(card.ends_at, 'weekdayDateTime') })
    return t('cards.endedMeta', { questions, end: when(card.ends_at, 'weekdayDate') })
  }

  const counts = (Object.keys(FILTERS) as Filter[]).map(key => [key, items.filter(card => FILTERS[key](card.status)).length] as const)
  const shown = items.filter(card => FILTERS[filter](card.status))

  return <section className="activity-cards">
    <div className="activity-cards__bar">
      <div role="group" aria-label={t('cards.filterLabel')} className="chips">
        {counts.map(([key, count]) => <button key={key} type="button" className="chip" aria-pressed={filter === key}
          onClick={() => setParams(key === 'all' ? {} : { filter: key }, { replace: true })}
        >{t(`cards.filters.${key}`)} {count}</button>)}
      </div>
      {canCreate && <Link className="button button--primary" to={`/teach/courses/${courseId}/activities/new`}><span aria-hidden="true">+</span>{t('empty.newActivity')}</Link>}
    </div>
    {notice && <p role="alert" className="form-error">{notice}</p>}
    {shown.length === 0 && <p className="activity-cards__none">{t('cards.noMatch')}</p>}
    <div className="activity-cards__list">
      {shown.map(card => <article key={card.id} className={`activity-card activity-card--${card.status}`}>
        <div className="activity-card__main">
          <div className="activity-card__head">
            <h3><Link className="activity-card__link" to={`/teach/activities/${card.id}`}>{card.title}</Link></h3>
            <span className={`status-pill status-pill--${card.status}`}>{t(`status.${card.status}`)}</span>
            {card.has_unpublished_changes && <span className="status-pill status-pill--quiet">{t('cards.pending')}</span>}
          </div>
          <span className="activity-card__meta">{meta(card)}</span>
        </div>
        <div className="activity-card__side">
          <ActivityCardStats activityId={card.id} status={card.status} />
        </div>
        <div className="activity-card__actions">
          {card.status === 'scheduled' && card.available_actions.includes('start_now') &&
            <button type="button" className="button button--dark" disabled={working === card.id} onClick={() => void transition(card, 'start_now')}>{t('cards.start')}</button>}
          <Menu
            label={t('cards.more', { title: card.title })}
            trigger={<span aria-hidden="true">⋮</span>}
            items={menuItems(card)}
            align="end"
            triggerClassName="icon-button icon-button--quiet"
            disabled={working === card.id}
          />
        </div>
      </article>)}
    </div>
    {confirm?.kind === 'delete' && <DeleteActivityDialog
      title={confirm.card.title}
      activityId={confirm.card.id}
      onCancel={() => setConfirm(null)}
      onDeleted={() => { setConfirm(null); void list.reload() }}
    />}
    {confirm && confirm.kind !== 'delete' && <Dialog
      title={t(confirm.kind === 'end' ? 'cards.endDialog.title' : 'cards.cancelDialog.title')}
      onClose={() => setConfirm(null)}
      footer={<>
        <button type="button" className="button button--quiet" onClick={() => setConfirm(null)}>{t('cards.cancel')}</button>
        <button type="button" className="button button--primary" onClick={() => { const card = confirm.card; setConfirm(null); void transition(card, 'end_now') }}>
          {t(confirm.kind === 'end' ? 'cards.endDialog.confirm' : 'cards.cancelDialog.confirm')}
        </button>
      </>}
    >
      <p className="dialog__text">{t(confirm.kind === 'end' ? 'cards.endDialog.body' : 'cards.cancelDialog.body', { title: confirm.card.title })}</p>
    </Dialog>}
    {inviting && <InviteDialog
      kind="activity"
      name={inviting.title}
      url={`${window.location.origin}/activities/${inviting.id}/join`}
      projectorTo={`/teach/activities/${inviting.id}/projector`}
      onClose={() => setInviting(null)}
    />}
  </section>
}

function EmptyActivities({ courseId, canCreate }: { courseId: string; canCreate: boolean }) {
  const { t } = useT('teach')
  return <section className="teach-empty">
    <span className="teach-empty__icon" aria-hidden="true"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M2 5h7a3 3 0 0 1 3 3v12a2 2 0 0 0-2-2H2zM22 5h-7a3 3 0 0 0-3 3v12a2 2 0 0 1 2-2h8z" /></svg></span>
    <h2>{t('empty.title')}</h2>
    <p>{t('empty.body')}</p>
    {canCreate && <Link className="button button--primary" to={`/teach/courses/${courseId}/activities/new`}><span aria-hidden="true">+</span>{t('empty.newActivity')}</Link>}
  </section>
}
