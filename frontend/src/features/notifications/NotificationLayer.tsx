import { useEffect } from 'react'
import { useT } from '../../i18n/useT'
import { Button, FormError } from '../../ui'
import { NotificationDialog } from './NotificationDialog'
import { useNotifications } from './NotificationsProvider'
import styles from './Notifications.module.css'

export function NotificationLayer() {
  const store = useNotifications()
  const start = store?.start
  const popup = store?.popup
  const { t } = useT('notifications')
  useEffect(() => { start?.() }, [start])

  if (!store) return null
  return <>
    {store.readFailed && !popup && <div className={styles.readError}>
      <FormError role="alert">{t('readFailed')}</FormError>
      <Button variant="outline" onClick={store.retryReads}>{t('retry')}</Button>
    </div>}
    {popup && <NotificationDialog key={popup.id} item={popup} onClose={() => { void store.closePopup(popup) }} />}
  </>
}
