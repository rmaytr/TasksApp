import { useEffect, useState } from 'react'

type Permission = NotificationPermission | 'unsupported'

function permission(): Permission {
  return typeof Notification === 'undefined' ? 'unsupported' : Notification.permission
}

/** The current permission, updated after our own request and when it changes in site settings. */
export function useNotificationPermission(): [Permission, () => void] {
  const [perm, setPerm] = useState(permission)
  useEffect(() => {
    let status: PermissionStatus | null = null
    const update = (): void => setPerm(permission())
    void navigator.permissions
      ?.query({ name: 'notifications' })
      .then((s) => {
        status = s
        s.addEventListener('change', update)
      })
      .catch(() => {})
    return () => status?.removeEventListener('change', update)
  }, [])
  const request = (): void => {
    void Notification.requestPermission().then(setPerm)
  }
  return [perm, request]
}
