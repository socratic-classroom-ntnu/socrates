import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { getNotifications, markNotificationRead, type Notification } from '../../contract/notificationClient'
import { useAuth } from '../auth/AuthContext'

type ListState =
  | { status: 'idle' | 'loading' | 'failed' }
  | { status: 'ready'; items: Notification[] }

type Notifications = {
  list: ListState
  start(): void
  reload(): void
  markRead(item: Notification): Promise<void>
  closePopup(item: Notification): Promise<void>
  popup: Notification | undefined
  hasUnread: boolean
  readFailed: boolean
  retryReads(): void
}

const NotificationsContext = createContext<Notifications | null>(null)

function entrySession(enabled: boolean) {
  return { enabled, started: false, writes: new Map<string, Promise<void>>() }
}

function emptySnapshot(session: ReturnType<typeof entrySession>) {
  return {
    session,
    list: { status: 'idle' } as ListState,
    dismissed: new Set<string>(),
    failed: new Map<string, Notification>(),
  }
}

/** One snapshot per authenticated entry, shared across all layouts without remounting the router. */
export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { account } = useAuth()
  const enabled = Boolean(account && (account.verified || account.kind === 'guest'))
  const key = enabled ? JSON.stringify([account?.id, account?.csrf_token]) : null
  const session = useMemo(() => entrySession(key !== null), [key])
  const [snapshot, setSnapshot] = useState(() => emptySnapshot(session))
  if (snapshot.session !== session) setSnapshot(emptySnapshot(session))

  const update = useCallback((change: (current: typeof snapshot) => typeof snapshot) => {
    setSnapshot(current => current.session === session ? change(current) : current)
  }, [session])

  const start = useCallback(() => {
    if (!session.enabled || session.started) return
    session.started = true
    update(current => ({ ...current, list: { status: 'loading' } }))
    void getNotifications().then(
      items => update(current => ({ ...current, list: { status: 'ready', items } })),
      () => update(current => ({ ...current, list: { status: 'failed' } })),
    )
  }, [session, update])

  function reload() {
    if (snapshot.list.status === 'failed') {
      session.started = false
      start()
    }
  }

  function markRead(item: Notification): Promise<void> {
    if (item.read) return Promise.resolve()
    const pending = session.writes.get(item.id)
    if (pending) return pending
    const write = markNotificationRead(item.id).then(() => {
      update(current => {
        const failed = new Map(current.failed)
        failed.delete(item.id)
        const list = current.list
        if (list.status !== 'ready') return { ...current, failed }
        const items = list.items.map(row => row.id === item.id ? { ...row, read: true, pop_up: false } : row)
        return { ...current, failed, list: { status: 'ready', items } }
      })
    }, () => {
      update(current => ({ ...current, failed: new Map(current.failed).set(item.id, item) }))
    }).finally(() => { session.writes.delete(item.id) })
    session.writes.set(item.id, write)
    return write
  }

  async function closePopup(item: Notification) {
    await markRead(item)
    // Failed receipts stay unread and can be retried without blocking subsequent announcements.
    update(current => ({ ...current, dismissed: new Set(current.dismissed).add(item.id) }))
  }

  const { list, dismissed, failed } = snapshot
  const items = list.status === 'ready' ? list.items : []

  return <NotificationsContext.Provider value={{
    list, start, reload, markRead, closePopup,
    popup: items.find(item => item.pop_up && !dismissed.has(item.id)),
    hasUnread: items.some(item => !item.read),
    readFailed: failed.size > 0,
    retryReads: () => { for (const item of failed.values()) void markRead(item) },
  }}>{children}</NotificationsContext.Provider>
}

export function useNotifications() {
  return useContext(NotificationsContext)
}
