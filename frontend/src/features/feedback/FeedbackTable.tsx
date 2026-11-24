import { useEffect, useState } from 'react'
import { Dialog } from '../../components/Dialog'
import { feedbackScreenshot, listFeedback, type FeedbackItem, type FeedbackPage } from '../../contract/classroomClient'
import { useT } from '../../i18n/useT'
import { Button, FormError } from '../../ui'
import styles from './Feedback.module.css'

type State = { status: 'loading' } | { status: 'error' } | { status: 'ready'; data: FeedbackPage }

const eyeIcon = <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></svg>

/** 類型的彩色標籤（後台 spec P13）：問題琥珀、建議藍、其他灰；沒選就是「—」。 */
export function KindTag({ kind }: { kind: FeedbackItem['kind'] }) {
  const { t } = useT('feedback')
  if (!kind) return <>{t('list.noKind')}</>
  return <span className={styles.kindTag} data-kind={kind}>{t(`kind.${kind}`)}</span>
}

/** 送出的人：身分＋帳號名（過期訪客、升級過的訪客另外說明）＋聯絡方式。 */
export function SenderText({ item }: { item: FeedbackItem }) {
  const { t } = useT('feedback')
  const who = t(`list.identity.${item.identity}`)
  const name = item.account_kind === 'expired_guest' ? t('list.expiredGuest')
    : item.account_kind === 'deleted' ? t('list.deletedAccount')
    : item.identity === 'guest' && item.account_kind === 'registered' ? t('list.nowAccount', { name: item.account_name ?? '' })
      : item.account_name
  return <>
    <div>{who}{name ? ` · ${name}` : ''}</div>
    {item.contact && <div className={styles.muted}>{item.contact}</div>}
  </>
}

/** 回饋詳情（Figma AD5b）：外層只放時間、類型、內容，其他都在這裡；截圖直接顯示，點了開新分頁。 */
export function FeedbackDetailDialog({ item, onClose, onError }: { item: FeedbackItem; onClose(): void; onError?(failure: unknown): void }) {
  const { t, locale } = useT('feedback')
  const [shot, setShot] = useState<string | 'failed' | null>(null)
  useEffect(() => {
    if (!item.has_screenshot) return
    let alive = true
    let url = ''
    void feedbackScreenshot(item.id).then(blob => {
      url = URL.createObjectURL(blob)
      if (alive) setShot(url)
    }).catch((failure: unknown) => { if (alive) { setShot('failed'); onError?.(failure) } })
    return () => { alive = false; if (url) URL.revokeObjectURL?.(url) }
  }, [item.id, item.has_screenshot, onError])
  const time = new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'short' })
  const rows: [string, React.ReactNode][] = [
    [t('list.time'), time.format(new Date(item.created_at * 1000))],
    [t('list.kind'), <KindTag key="k" kind={item.kind} />],
    [t('list.message'), <span key="m" className={styles.messageCell}>{item.message}</span>],
    [t('list.page'), <code key="p">{item.page}</code>],
    [t('list.sender'), <SenderText key="s" item={item} />],
    [t('list.device'), <span key="d">{item.viewport_w}×{item.viewport_h} · {item.locale}<span className={styles.muted} style={{ display: 'block' }}>{item.user_agent}</span></span>],
    [t('list.release'), <span key="r" className={styles.muted}>{item.release_id}</span>],
  ]
  return <Dialog title={t('list.detailTitle')} onClose={onClose} size="default">
    <dl className={styles.detail}>
      {rows.map(([label, value]) => <div key={label} className={styles.detailRow}><dt>{label}</dt><dd>{value}</dd></div>)}
      <div className={styles.detailRow}>
        <dt>{t('list.screenshot')}</dt>
        <dd>{item.has_screenshot
          ? <>
            {shot === 'failed'
              ? <span className={styles.muted}>{t('list.screenshotUnavailable')}</span>
              : shot
              ? <a href={shot} target="_blank" rel="noreferrer" aria-label={t('list.screenshotAlt')}><img className={styles.shot} src={shot} alt={t('list.screenshotAlt')} /></a>
              : <span className={styles.muted}>{t('common:loading')}</span>}
            <span className={styles.muted} style={{ display: 'block' }}>{t('list.purgeNote')}</span>
          </>
          : t('list.noScreenshot')}</dd>
      </div>
    </dl>
  </Dialog>
}

/** 後台的回饋列表（Figma AD5）：時間、類型、內容、眼睛；換頁先鎖住，等那一頁回來。 */
/** `onError` 讓後台在權限被收回（404）時重新讀帳號狀態（後台 code review R1）。 */
export function FeedbackTable({ onError }: { onError?(failure: unknown): void } = {}) {
  const { t, locale } = useT('feedback')
  const [page, setPage] = useState(1)
  const [state, setState] = useState<State>({ status: 'loading' })
  const [open, setOpen] = useState<FeedbackItem | null>(null)

  useEffect(() => {
    let alive = true
    listFeedback(page)
      .then(data => { if (alive) setState({ status: 'ready', data }) })
      .catch((failure: unknown) => { if (alive) { setState({ status: 'error' }); onError?.(failure) } })
    return () => { alive = false }
  }, [page, onError])

  function go(next: number) {
    setState({ status: 'loading' })
    setPage(next)
  }

  const time = new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'short' })
  return <>
    {state.status === 'error' && <FormError role="alert">{t('list.loadFailed')}</FormError>}
    {state.status === 'ready' && (state.data.items.length === 0
      ? <p>{t('list.empty')}</p>
      : <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead><tr>
            <th className={styles.timeCol}>{t('list.time')}</th><th className={styles.kindCol}>{t('list.kind')}</th>
            <th>{t('list.message')}</th><th className={styles.eyeCol}><span className="sr-only">{t('list.openDetail')}</span></th>
          </tr></thead>
          <tbody>
            {state.data.items.map(item => <tr key={item.id}>
              <td>{time.format(new Date(item.created_at * 1000))}</td>
              <td><KindTag kind={item.kind} /></td>
              <td className={styles.messageCell}>{item.message}</td>
              <td><button type="button" className={styles.eye} aria-label={t('list.openDetail')} onClick={() => setOpen(item)}>{eyeIcon}</button></td>
            </tr>)}
          </tbody>
        </table>
      </div>)}
    <nav className={styles.pager} aria-label={t('list.pageNumber', { page })}>
      <span>{t('list.pageNumber', { page })}</span>
      <Button variant="outline" disabled={page <= 1 || state.status === 'loading'} onClick={() => go(page - 1)}>{t('list.previous')}</Button>
      <Button variant="outline" disabled={state.status !== 'ready' || !state.data.has_more} onClick={() => go(page + 1)}>{t('list.next')}</Button>
    </nav>
    {open && <FeedbackDetailDialog item={open} onClose={() => setOpen(null)} onError={onError} />}
  </>
}
