import { useEffect, useState } from 'react'
import { api } from '../../contract/classroomClient'
import type { components } from '../../contract/classroomTypes'
import type { JoinTarget } from '../../shared/next'
import { useT } from '../../i18n/useT'

type PublicPreview = { courseName: string | null; guestAllowed: boolean }

/** The course name for J0's banner, fetched without signing in. Any failure just leaves it out. */
export function usePublicCourseName(target: JoinTarget | null): string | null {
  return usePublicPreview(target).courseName
}

/** What J0 needs before signing in: the course name, and whether 免註冊加入 is offered. It is not
 * when the course does not allow guests, the activity has ended, or the preview cannot be read
 * (network error, too many requests, a code that does not exist): then only login (G06). */
export function usePublicPreview(target: JoinTarget | null): PublicPreview {
  const [preview, setPreview] = useState<PublicPreview>({ courseName: null, guestAllowed: false })
  const key = target ? (target.kind === 'course' ? 'c:' + target.code : 'a:' + target.activityId) : null
  useEffect(() => {
    if (!target) return
    let live = true
    const path = target.kind === 'course'
      ? '/course-join/public-preview?code=' + encodeURIComponent(target.code)
      : `/activities/${encodeURIComponent(target.activityId)}/public-preview`
    api(path).then(
      (found: components['schemas']['PublicActivityPreview'] | components['schemas']['PublicJoinPreview']) => {
        if (!live) return
        const ended = 'status' in found && found.status === 'ended'
        setPreview({ courseName: found.course_name, guestAllowed: Boolean(found.allow_guest) && !ended })
      },
      () => { if (live) setPreview({ courseName: null, guestAllowed: false }) },
    )
    return () => { live = false }
    // key 代表 target 的內容；target 物件本身每次 render 都是新的
  }, [key])
  return preview
}

/** J0: the dark banner above the login and name cards (design 01 / G05). Both pages say the same thing:
 * how the student arrived and what they are joining. */
export function JoinLoginBanner({ courseName, kind }: { courseName: string | null; kind: JoinTarget['kind'] }) {
  const { t } = useT('join')
  return <div className="join-banner" role="status">
    <span className="join-banner__check" aria-hidden="true">✓</span>
    <span className="join-banner__text">
      <small>{t(kind === 'course' ? 'banner.fromCourse' : 'banner.fromActivity')}</small>
      {courseName && <strong>{t('banner.joining', { name: courseName })}</strong>}
    </span>
  </div>
}
