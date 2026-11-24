import styles from './Notifications.module.css'

export function NotificationBell({ mobile = false }: { mobile?: boolean }) {
  return <span className={mobile ? styles.mobileBell : styles.bell} aria-hidden="true" />
}
