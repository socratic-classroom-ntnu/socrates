import { Dialog } from '../../components/Dialog'
import type { Notification } from '../../contract/notificationClient'
import { useT } from '../../i18n/useT'
import { Button, ButtonLink } from '../../ui'
import { useNotificationText } from './notificationText'
import styles from './Notifications.module.css'

export function NoticeLabel({ type }: { type: Notification['type'] }) {
  const { t } = useT('notifications')
  return <span className={styles.label} data-type={type}>{t(`type.${type}`)}</span>
}

export function NotificationDialog({ item, onClose }: { item: Notification; onClose(): void }) {
  const { t, locale } = useT('notifications')
  const { title, content } = useNotificationText(item, true)
  let footer
  if (item.type === 'guest_expiry') {
    footer = <ButtonLink variant="primary" to="/guest/register" onClick={onClose}>{t('guest.register')}</ButtonLink>
  } else if (item.type === 'activity') {
    footer = <ButtonLink variant="primary" to={`/learn/activities/${encodeURIComponent(item.activity_id)}`} onClick={onClose}>{t('activity.open')}</ButtonLink>
  } else {
    footer = <Button variant="primary" onClick={onClose}>{t('acknowledge')}</Button>
  }
  const maintenance = item.type === 'announcement' ? item.maintenance : null
  return <Dialog title={title} eyebrow={<NoticeLabel type={item.type} />} onClose={onClose} footer={footer}>
    <p className={styles.dialogText}>{content}</p>
    {maintenance && <div className={styles.maintenance}>
      <strong>{t('maintenance', { date: new Intl.DateTimeFormat(locale, { dateStyle: 'full', timeZone: 'UTC' }).format(new Date(maintenance.date)) })}</strong>
      <span>{maintenance.start} — {maintenance.end}</span>
    </div>}
  </Dialog>
}
