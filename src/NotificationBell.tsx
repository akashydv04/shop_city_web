import { useEffect, useState } from 'react'
import { Bell } from 'lucide-react'
import { authApi } from './services/authApi'
import { notificationsApi } from './services/notificationsApi'

const refreshIntervalMs = 60_000

export default function NotificationBell() {
  const [identity, setIdentity] = useState(() => authApi.getIdentity())
  const [count, setCount] = useState(0)

  useEffect(() => {
    const unsubscribe = authApi.subscribe(() => setIdentity(authApi.getIdentity()))
    return () => { unsubscribe() }
  }, [])

  useEffect(() => {
    let alive = true
    async function refresh() {
      if (!alive || !identity || !notificationsApi.isAvailable()) {
        if (alive) setCount(0)
        return
      }
      try {
        const nextCount = await notificationsApi.unreadCount()
        if (alive) setCount(nextCount)
      } catch {
        // The bell fails closed: a count error never invents a notification.
        if (alive) setCount(0)
      }
    }
    void refresh()
    const interval = window.setInterval(() => void refresh(), refreshIntervalMs)
    const unsubscribe = notificationsApi.subscribe(() => void refresh())
    const onHashChange = () => void refresh()
    window.addEventListener('hashchange', onHashChange)
    return () => {
      alive = false
      window.clearInterval(interval)
      unsubscribe()
      window.removeEventListener('hashchange', onHashChange)
    }
  }, [identity])

  if (!identity) return null
  return <a className="notification-bell" href="#notifications" aria-label={count > 0 ? `Notifications, ${count} unread` : 'Notifications'}><Bell size={18} />{count > 0 && <b>{count > 99 ? '99+' : count}</b>}</a>
}
