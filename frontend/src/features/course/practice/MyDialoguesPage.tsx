import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ApiError, api } from '../../../contract/classroomClient'
import type { components } from '../../../contract/classroomTypes'
import { useResource } from '../../../contract/useResource'
import { errorMessage } from '../../../i18n/errors'
import { formatDateTime } from '../../../i18n/format'
import { useT } from '../../../i18n/useT'
import { useIsPhone } from '../../../shared/useIsPhone'
import { Button, ButtonLink, FormError } from '../../../ui'
import { useAuth } from '../../auth/AuthContext'
import { JoinCodeForm } from '../home/JoinCodeForm'
import { TopicPicker } from './TopicPicker'
import styles from './MyDialogues.module.css'

export type Topic = components['schemas']['PracticeTopic']
export type Dialogue = components['schemas']['PracticeDialogue']
type PracticeList = components['schemas']['PracticeList']

// 訪客註冊升級頁由免註冊需求做（這裡只連過去）
const GUEST_REGISTER = '/guest/register'
// 「還可以聊這些」在電腦上只放兩張，其餘從「看全部題目」挑（畫布 MyDialogList）
const DESKTOP_MORE = 2
// 第一次進來、訪客、手機的「還可以聊這些」最多放幾張推薦題；題庫比這多時，每次進頁面隨機換一批
const FEATURED = 6

/** Up to `count` topics picked at random, kept in bank order; all of them when they fit. */
function pickFeatured(topics: Topic[], count: number): Topic[] {
  if (topics.length <= count) return topics
  const indexes = topics.map((_, index) => index)
  for (let i = 0; i < count; i++) {
    const j = i + Math.floor(Math.random() * (indexes.length - i))
    ;[indexes[i], indexes[j]] = [indexes[j], indexes[i]]
  }
  return indexes.slice(0, count).sort((a, b) => a - b).map(index => topics[index])
}

/**
 * 學生「我的對話」（spec §10 M15、M17、M19；畫布 MyDialogFirst／List／Quota／Guest＋Phone）。
 * 卡片的狀態（對話中／已完成）由後端給，前端不從作答狀態推導。
 */
export function MyDialoguesPage() {
  const { t } = useT('practice')
  const { account } = useAuth()
  const phone = useIsPhone()
  const navigate = useNavigate()
  const guest = account?.kind === 'guest'
  const bank = useResource<Topic[]>('/solo/practice/bank')
  const list = useResource<PracticeList>(guest ? null : '/solo/practice')
  const [picking, setPicking] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)

  async function start(topic: Topic) {
    setBusy(true)
    setError(null)
    try {
      const started = await api('/solo/practice', 'POST', { bank_item_id: topic.id })
      navigate(`/learn/activities/${started.activity_id}/dialogue`)
    } catch (failure) {
      setPicking(false)
      // 次數剛好用完：重讀額度，畫面上的提示會說明；其他錯誤直接說
      if (failure instanceof ApiError && failure.detail === 'PRACTICE_DAILY_LIMIT') await list.reload()
      else setError(failure)
    } finally {
      setBusy(false)
    }
  }

  // 卡片只放推薦題；「看全部題目」的挑題視窗列整個題庫
  const allTopics = bank.data ?? []
  // Kept while the bank is the same, so the random picks below hold for the whole visit.
  const topics = useMemo(() => (bank.data ?? []).filter(topic => topic.recommended), [bank.data])
  const featured = useMemo(() => pickFeatured(topics, FEATURED), [topics])
  // 題庫和列表都要回來才畫；任一支失敗就說沒載入成功，不留一片空白
  const loading = (bank.loading && !bank.data) || (!guest && list.loading && !list.data)
  const failed = !loading && (!bank.data || (!guest && !list.data))

  return <main className={styles.page + (phone ? ' ' + styles.phone : '')}>
    <h1 className={styles.title}>{t('title')}</h1>
    {phone && <JoinCodeForm variant="phone" />}
    <section className={styles.panel} aria-label={t('title')}>
      {guest
        ? <GuestView topics={featured} loading={loading} failed={failed} />
        : <>
          {loading && <div aria-busy="true" className={styles.loading} />}
          {failed && <FormError role="alert">{t('loadFailed')}</FormError>}
          {!loading && !failed && list.data && (list.data.dialogues.length === 0
            ? <FirstTime topics={featured} remaining={list.data.quota.remaining} busy={busy} onStart={start} />
            : <WithDialogues data={list.data} topics={topics} phone={phone} busy={busy} onStart={start} onPick={() => setPicking(true)} />)}
          {error !== null && <FormError role="alert">{errorMessage(t, error)}</FormError>}
        </>}
    </section>
    {picking && list.data && <TopicPicker
      topics={allTopics}
      dialogues={list.data.dialogues}
      remaining={list.data.quota.remaining}
      phone={phone}
      busy={busy}
      onStart={start}
      onClose={() => setPicking(false)}
    />}
  </main>
}

function FirstTime({ topics, remaining, busy, onStart }: { topics: Topic[]; remaining: number; busy: boolean; onStart(topic: Topic): void }) {
  const { t } = useT('practice')
  return <>
    <div className={styles.board}>
      <span className={styles.seal} aria-hidden="true">問</span>
      <h2>{t('start')}</h2>
    </div>
    <div className={styles.grid}>
      {topics.map(topic => <TopicCard key={topic.id} topic={topic} state={remaining > 0 ? 'open' : 'tomorrow'} busy={busy} onStart={onStart} />)}
    </div>
  </>
}

type StatusFilter = 'all' | Dialogue['status']
type CategoryFilter = 'all' | Topic['category']
type Order = 'newest' | 'oldest'
const CATEGORIES: Topic['category'][] = ['life', 'honesty', 'self', 'tech']

/** The reader's own calendar day of a backend time, as the `yyyy-mm-dd` a date input gives. */
function localDay(seconds: number): string {
  const date = new Date(seconds * 1000)
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/**
 * 「最近的對話」的篩選與排序（使用者回饋 fb009）：狀態、標籤、開始日期區間，依開始時間新到舊或舊到新。
 * 全部在前端做；後端一次給齊這個學生的練習對話。
 */
function useDialogueFilter(dialogues: Dialogue[]) {
  const [status, setStatus] = useState<StatusFilter>('all')
  const [category, setCategory] = useState<CategoryFilter>('all')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [order, setOrder] = useState<Order>('newest')
  const shown = useMemo(() => dialogues
    .filter(dialogue => status === 'all' || dialogue.status === status)
    .filter(dialogue => category === 'all' || dialogue.category === category)
    .filter(dialogue => {
      const day = localDay(dialogue.created_at)
      return (!from || day >= from) && (!to || day <= to)
    })
    .sort((a, b) => order === 'newest' ? b.created_at - a.created_at : a.created_at - b.created_at),
  [dialogues, status, category, from, to, order])
  const active = status !== 'all' || category !== 'all' || from !== '' || to !== ''
  function clear() { setStatus('all'); setCategory('all'); setFrom(''); setTo('') }
  return { shown, active, clear, status, setStatus, category, setCategory, from, setFrom, to, setTo, order, setOrder }
}

function DialogueFilters({ filter }: { filter: ReturnType<typeof useDialogueFilter> }) {
  const { t } = useT('practice')
  return <div className={styles.filters} role="group" aria-label={t('filter.label')}>
    <label className={styles.filter}>{t('filter.status')}
      <select value={filter.status} onChange={event => filter.setStatus(event.target.value as StatusFilter)}>
        <option value="all">{t('filter.all')}</option>
        <option value="in_progress">{t('inProgress')}</option>
        <option value="completed">{t('completed')}</option>
      </select>
    </label>
    <label className={styles.filter}>{t('filter.category')}
      <select value={filter.category} onChange={event => filter.setCategory(event.target.value as CategoryFilter)}>
        <option value="all">{t('filter.all')}</option>
        {CATEGORIES.map(category => <option key={category} value={category}>{t(`category.${category}`)}</option>)}
      </select>
    </label>
    <label className={styles.filter}>{t('filter.from')}
      <input type="date" value={filter.from} max={filter.to || undefined} onChange={event => filter.setFrom(event.target.value)} />
    </label>
    <label className={styles.filter}>{t('filter.to')}
      <input type="date" value={filter.to} min={filter.from || undefined} onChange={event => filter.setTo(event.target.value)} />
    </label>
    <label className={styles.filter}>{t('filter.order')}
      <select value={filter.order} onChange={event => filter.setOrder(event.target.value as Order)}>
        <option value="newest">{t('filter.newest')}</option>
        <option value="oldest">{t('filter.oldest')}</option>
      </select>
    </label>
    {filter.active && <button type="button" className={styles.linkButton} onClick={filter.clear}>{t('filter.clear')}</button>}
  </div>
}

function WithDialogues({ data, topics, phone, busy, onStart, onPick }: {
  data: PracticeList; topics: Topic[]; phone: boolean; busy: boolean; onStart(topic: Topic): void; onPick(): void
}) {
  const { t } = useT('practice')
  const { quota, dialogues } = data
  // M17：只列還沒做答過的題目；手機一次抽好，不在每次重畫時換題
  const more = useMemo(() => {
    const started = new Set(dialogues.map(dialogue => dialogue.topic_id))
    const unstarted = topics.filter(topic => !started.has(topic.id))
    return phone ? pickFeatured(unstarted, FEATURED) : unstarted.slice(0, DESKTOP_MORE)
  }, [topics, dialogues, phone])
  const exhausted = quota.remaining <= 0
  const filter = useDialogueFilter(dialogues)
  return <>
    <div className={styles.bar}>
      <h2 className={styles.recentTitle}>{t('recent')} <span className={styles.count}>{dialogues.length}</span></h2>
      <span className={styles.barEnd}>
        {!exhausted && <span className={styles.remaining}>{t('remaining', { count: quota.remaining })}</span>}
        <Button variant="primary" disabled={exhausted} aria-haspopup="dialog" onClick={onPick}><span aria-hidden="true">+</span>{t('newDialogue')}</Button>
      </span>
    </div>
    {exhausted && <p role="status" className={styles.quota}>{t('quotaUsed', { limit: quota.limit })}</p>}
    <DialogueFilters filter={filter} />
    {filter.active && <p role="status" className={styles.filterCount}>{t('filter.shown', { shown: filter.shown.length, total: dialogues.length })}</p>}
    {filter.shown.length === 0
      ? <p className={styles.noMatch}>{t('filter.none')}</p>
      : <ul className={styles.grid} aria-label={t('recent')}>
        {filter.shown.map(dialogue => <li key={dialogue.activity_id}><DialogueCard dialogue={dialogue} /></li>)}
      </ul>}
    {more.length > 0 && <section className={styles.more} aria-labelledby="practice-more">
      <div className={styles.moreBar}>
        <h3 id="practice-more">{t('more')}</h3>
        <button type="button" className={styles.linkButton} onClick={onPick} disabled={exhausted}>{t(phone ? 'seeAllPhone' : 'seeAll')}</button>
      </div>
      <div className={phone ? styles.row : styles.grid}>
        {more.map(topic => <TopicCard key={topic.id} topic={topic} state={exhausted ? 'tomorrow' : 'open'} busy={busy} onStart={onStart} />)}
      </div>
    </section>}
  </>
}

function DialogueCard({ dialogue }: { dialogue: Dialogue }) {
  const { t, locale } = useT('practice')
  const done = dialogue.status === 'completed'
  const to = `/learn/activities/${dialogue.activity_id}/dialogue`
  return <article className={`${styles.card} ${styles[`cat-${dialogue.category ?? 'none'}`]}`}>
    <div className={styles.cardHead}>
      <h3>{dialogue.title}</h3>
      <span className={done ? styles.pillDone : styles.pillOpen}>{t(done ? 'completed' : 'inProgress')}</span>
    </div>
    <div className={styles.cardBody}>
      <span className={styles.excerpt}>{dialogue.body}</span>
      <span className={styles.date}>{t('startedAt', { at: formatDateTime(dialogue.created_at, locale, 'yearWeekdayDateTime') })}</span>
    </div>
    {done
      ? <ButtonLink variant="quiet" className={styles.action} to={to}>{t('review')}<span aria-hidden="true">→</span></ButtonLink>
      : <ButtonLink variant="primary" className={styles.action} to={to}>{t('resume')}<span aria-hidden="true">→</span></ButtonLink>}
  </article>
}

type CardState = 'open' | 'tomorrow' | 'locked'

export function TopicCard({ topic, state, busy = false, onStart }: { topic: Topic; state: CardState; busy?: boolean; onStart?(topic: Topic): void }) {
  const { t } = useT('practice')
  const open = state === 'open'
  const footer = open ? <>{t('startDialogue')}<span aria-hidden="true">→</span></> : t(state === 'locked' ? 'guestLocked' : 'tomorrow')
  return <button
    type="button"
    className={`${styles.card} ${styles.topic} ${open ? styles[`cat-${topic.category}`] : styles.disabledCard}`}
    disabled={!open || busy}
    onClick={() => onStart?.(topic)}
  >
    <span className={styles.cardHead}>
      <b>{topic.title}</b>
      <span className={`${styles.categoryPill} ${styles[`pill-${topic.category}`]}`}>{t(`category.${topic.category}`)}</span>
    </span>
    <span className={styles.cardBody}><span className={styles.excerpt}>{topic.body}</span></span>
    <span className={open ? styles.start : styles.waiting}>{footer}</span>
  </button>
}

function GuestView({ topics, loading, failed }: { topics: Topic[]; loading: boolean; failed: boolean }) {
  const { t } = useT('practice')
  return <>
    <div className={styles.guest}>
      <span className={styles.guestIcon} aria-hidden="true">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 5h16v11H9l-5 4z" /><path d="M8 9h8M8 12h5" /></svg>
      </span>
      <span className={styles.guestText}><b>{t('guestTitle')}</b><span>{t('guestBody')}</span></span>
      <ButtonLink variant="primary" className={styles.guestButton} to={GUEST_REGISTER}>{t('guestRegister')}</ButtonLink>
    </div>
    {loading && <div aria-busy="true" className={styles.loading} />}
    {failed && <FormError role="alert">{t('loadFailed')}</FormError>}
    {!loading && !failed && <section aria-labelledby="practice-guest-topics" className={styles.more}>
      <h3 id="practice-guest-topics">{t('guestTopics')}</h3>
      <div className={styles.grid}>
        {topics.map(topic => <TopicCard key={topic.id} topic={topic} state="locked" />)}
      </div>
    </section>}
  </>
}
