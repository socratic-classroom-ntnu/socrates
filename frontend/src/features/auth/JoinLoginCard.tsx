import { useEffect, useState } from 'react'
import { api } from '../../contract/classroomClient'
import type { components } from '../../contract/classroomTypes'
import type { JoinTarget } from '../../shared/next'
import { useT } from '../../i18n/useT'

type PublicPreview = { courseName: string | null; guestAllowed: boolean; restricted: boolean }

/** The course name for J0's banner, fetched without signing in. Any failure just leaves it out. */
export function usePublicCourseName(target: JoinTarget | null): string | null {
  return usePublicPreview(target).courseName
}

/** What J0 needs before signing in: the course name, and whether 免註冊加入 is offered. It is not
 * when the course does not allow guests, the activity has ended, or the preview cannot be read
 * (network error, too many requests, a code that does not exist): then only login. `restricted` is
 * only the first of those: the preview was read and the course does not take guests (G06). */
export function usePublicPreview(target: JoinTarget | null): PublicPreview {
  const [preview, setPreview] = useState<PublicPreview>({ courseName: null, guestAllowed: false, restricted: false })
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
        setPreview({ courseName: found.course_name, guestAllowed: Boolean(found.allow_guest) && !ended, restricted: found.allow_guest === false })
      },
      () => { if (live) setPreview({ courseName: null, guestAllowed: false, restricted: false }) },
    )
    return () => { live = false }
    // key 代表 target 的內容；target 物件本身每次 render 都是新的
  }, [key])
  return preview
}

/** J0: the dark banner above the login and name cards (design 01 / G05). Both pages say the same thing:
 * how the student arrived and what they are joining. An activity shows its own title and the course
 * it belongs to when the page knows them (a signed-in student); before sign-in only the course is known. */
export function JoinLoginBanner({ courseName, kind, activityTitle = null }: { courseName: string | null; kind: JoinTarget['kind']; activityTitle?: string | null }) {
  const { t } = useT('join')
  const titled = kind === 'activity' && activityTitle
  return <div className="join-banner" role="status">
    <span className="join-banner__check" aria-hidden="true">✓</span>
    <span className="join-banner__text">
      <small>{t(kind === 'course' ? 'banner.fromCourse' : 'banner.fromActivity')}</small>
      {titled
        ? <><strong>{activityTitle}</strong>{courseName && <small>{t('banner.ofCourse', { name: courseName })}</small>}</>
        : courseName && <strong>{t('banner.joining', { name: courseName })}</strong>}
    </span>
  </div>
}
