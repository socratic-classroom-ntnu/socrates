import { useId, useState } from 'react'
import type { Notification } from '../../contract/notificationClient'
import { useT } from '../../i18n/useT'
import { Button, FormError } from '../../ui'
import { NoticeLabel, NotificationDialog } from './NotificationDialog'
import { useNotificationText } from './notificationText'
import { useNotifications } from './NotificationsProvider'
import styles from './Notifications.module.css'

function NotificationCard({ item, open }: { item: Notification; open(): void }) {
  const { t } = useT('notifications')
  const { title, content } = useNotificationText(item)
  const summaryId = useId()
  const unreadId = `${summaryId}-unread`
  return <li>
    <Button
      className={styles.card}
      aria-label={t('viewNamed', { title })}
      aria-describedby={item.read ? summaryId : `${unreadId} ${summaryId}`}
      onClick={open}
      data-read={item.read}
    >
      <span className={styles.cardBody}>
        <span className={styles.cardHeading}>
          <span className={styles.dot} data-read={item.read}>
            {!item.read && <span className="sr-only" id={unreadId}>{t('unread')}</span>}
          </span>
          <NoticeLabel type={item.type} />
          <span className={styles.cardTitle}>{title}</span>
        </span>
        <span className={styles.summary} id={summaryId}>{content}</span>
      </span>
      <span className={styles.view} aria-hidden="true">{t('view')}</span>
      <span className={styles.chevron} aria-hidden="true" />
    </Button>
  </li>
}

export function NotificationsPage() {
  const { t } = useT('notifications')
  const notifications = useNotifications()
  const [selected, setSelected] = useState<Notification | null>(null)
  if (!notifications) return null
  const { list, reload, markRead } = notifications
  const count = list.status === 'ready' ? t('count', { count: list.items.length }) : null
  return <main className={styles.page}>
    <header className={styles.pageHeading}>
      <h1>{t('title')}</h1>
      {count && <span className={styles.mobileCount}>{count}</span>}
    </header>
    <section className={styles.panel} aria-label={t('all')}>
      <div className={styles.panelHeading}>
        <h2>{t('all')}</h2>{count && <span>{count}</span>}
      </div>
      {(list.status === 'idle' || list.status === 'loading') && <p role="status" className={styles.empty}>{t('loading')}</p>}
      {list.status === 'failed' && <div className={styles.loadError}>
        <FormError role="alert">{t('loadFailed')}</FormError>
        <Button variant="outline" onClick={reload}>{t('retry')}</Button>
      </div>}
      {list.status === 'ready' && (list.items.length ? <ul className={styles.list}>
        {list.items.map(item => <NotificationCard key={item.id} item={item} open={() => {
          setSelected(item)
          void markRead(item)
        }} />)}
      </ul> : <p className={styles.empty}>{t('empty')}</p>)}
    </section>
    {selected && <NotificationDialog item={selected} onClose={() => setSelected(null)} />}
  </main>
}
