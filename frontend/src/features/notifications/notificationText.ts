import type { Notification } from '../../contract/notificationClient'
import { useT } from '../../i18n/useT'
import { guestKeepUntil } from '../auth/guestExpiry'

export function useNotificationText(item: Notification, detail = false) {
  const { t, locale } = useT('notifications')
  if (item.type === 'guest_expiry') {
    const { date } = guestKeepUntil(item.guest_expires_at, locale)
    return { title: t('guest.title'), content: t(detail ? 'guest.body' : 'guest.summary', { date }) }
  }
  if (item.type === 'activity') {
    const values = { course: item.course_name, activity: item.activity_name }
    return {
      title: t(detail ? 'activity.detailTitle' : 'activity.title', values),
      content: t(detail ? 'activity.body' : 'activity.summary', values),
    }
  }
  return { title: item.title, content: item.content }
}
