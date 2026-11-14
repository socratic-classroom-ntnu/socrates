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

/** J0: the dark banner above the login card. The guest name page joins without logging in, so it
 * passes its own wording (`guest`). */
export function JoinLoginBanner({ courseName, guest = false }: { courseName: string | null; guest?: boolean }) {
  const { t } = useT('join')
  const joining = guest ? t('guest:join.joining') : t('login.joining')
  const noName = guest ? t('guest:join.noName') : t('login.noName')
  return <div className="join-banner" role="status">
    <span className="join-banner__check" aria-hidden="true">✓</span>
    {courseName
      ? <span className="join-banner__text"><small>{joining}</small><strong>{courseName}</strong></span>
      : <span className="join-banner__text"><small>{noName}</small></span>}
  </div>
}
