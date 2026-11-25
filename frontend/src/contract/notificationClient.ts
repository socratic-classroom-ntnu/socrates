import { typedApi } from './classroomClient'
import type { paths, requestComponents } from './classroomTypes'

export type Notification = paths['/notifications']['get']['response'][number]
export type Announcement = paths['/admin/announcements']['get']['response'][number]
export type AnnouncementInput = requestComponents['schemas']['AnnouncementInput']

export async function getNotifications() {
  return typedApi('/notifications', 'GET')
}

export async function markNotificationRead(id: string) {
  return typedApi('/notifications/read', 'POST', { body: { id } })
}

export async function listAnnouncements() {
  return typedApi('/admin/announcements', 'GET')
}

export async function createAnnouncement(body: AnnouncementInput) {
  return typedApi('/admin/announcements', 'POST', { body })
}

export async function deleteAnnouncement(id: string) {
  return typedApi('/admin/announcements/{announcement_id}', 'DELETE', { path: { announcement_id: id } })
}
