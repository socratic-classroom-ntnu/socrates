import { useEffect, useState } from 'react'
import { NotFoundPage } from '../../components/ComingSoonPage'
import { ApiError, feedbackScreenshot, listFeedback, type FeedbackItem, type FeedbackPage } from '../../contract/classroomClient'
import { useT } from '../../i18n/useT'
import { Button, FormError } from '../../ui'
import styles from './Feedback.module.css'

type State = { status: 'loading' } | { status: 'missing' } | { status: 'error' } | { status: 'ready'; data: FeedbackPage }

/** 回饋列表：只有 SOCRATES_FEEDBACK_READERS 名單上的帳號看得到，其他人看到的是找不到頁面（spec P8）。 */
export function FeedbackListPage() {
  const { t, locale } = useT('feedback')
  const [page, setPage] = useState(1)
  const [state, setState] = useState<State>({ status: 'loading' })

  useEffect(() => {
    let alive = true
    listFeedback(page)
      .then(data => { if (alive) setState({ status: 'ready', data }) })
      .catch(error => { if (alive) setState({ status: error instanceof ApiError && error.status === 404 ? 'missing' : 'error' }) })
    return () => { alive = false }
  }, [page])

  if (state.status === 'missing') return <NotFoundPage />

  // 換頁先清空並鎖住按鈕，等那一頁回來（連按不會跳頁，頁碼與內容一致）
  function go(next: number) {
    setState({ status: 'loading' })
    setPage(next)
  }

  // 先同步開新分頁（瀏覽器才不會擋），拿到圖再把網址換過去（P16）
  function openShot(id: string) {
    const tab = window.open('', '_blank')
    void feedbackScreenshot(id)
      .then(blob => { if (tab) tab.location.href = URL.createObjectURL(blob) })
      .catch(() => tab?.close())
  }

  function sender(item: FeedbackItem) {
    const who = t(`list.identity.${item.identity}`)
    const name = item.account_kind === 'expired_guest' ? t('list.expiredGuest')
      : item.identity === 'guest' && item.account_kind === 'registered' ? t('list.nowAccount', { name: item.account_name ?? '' })
        : item.account_name
    return <>
      <div>{who}{name ? ` · ${name}` : ''}</div>
      {item.contact && <div className={styles.muted}>{item.contact}</div>}
    </>
  }

  const time = new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'short' })
  return <main className={styles.listPage}>
    <h1>{t('list.title')}</h1>
    {state.status === 'error' && <FormError role="alert">{t('failed')}</FormError>}
    {state.status === 'ready' && (state.data.items.length === 0
      ? <p>{t('list.empty')}</p>
      : <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead><tr>
            <th>{t('list.time')}</th><th>{t('list.kind')}</th><th>{t('list.message')}</th><th>{t('list.page')}</th>
            <th>{t('list.sender')}</th><th>{t('list.device')}</th><th>{t('list.release')}</th><th>{t('list.screenshot')}</th>
          </tr></thead>
          <tbody>
            {state.data.items.map(item => <tr key={item.id}>
              <td>{time.format(new Date(item.created_at * 1000))}</td>
              <td>{item.kind ? t(`kind.${item.kind}`) : t('list.noKind')}</td>
              <td className={styles.messageCell}>{item.message}</td>
              <td><code>{item.page}</code></td>
              <td>{sender(item)}</td>
              <td><div>{item.viewport_w}×{item.viewport_h} · {item.locale}</div><div className={styles.muted}>{item.user_agent}</div></td>
              <td className={styles.muted}>{item.release_id}</td>
              <td>{item.has_screenshot
                ? <Button variant="outline" onClick={() => openShot(item.id)}>{t('list.openScreenshot')}</Button>
                : t('list.noScreenshot')}</td>
            </tr>)}
          </tbody>
        </table>
      </div>)}
    <nav className={styles.pager} aria-label={t('list.pageNumber', { page })}>
      <span>{t('list.pageNumber', { page })}</span>
      <Button variant="outline" disabled={page <= 1 || state.status === 'loading'} onClick={() => go(page - 1)}>{t('list.previous')}</Button>
      <Button variant="outline" disabled={state.status !== 'ready' || !state.data.has_more} onClick={() => go(page + 1)}>{t('list.next')}</Button>
    </nav>
  </main>
}
