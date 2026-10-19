import { useEffect, useState } from 'react'
import { api } from '../../api/classroomClient'
import type { components } from '../../api/classroomTypes'
import type { JoinTarget } from '../../app/next'
import { useT } from '../../i18n/useT'

/** The course name for J0's banner, fetched without signing in. Any failure just leaves it out. */
export function usePublicCourseName(target: JoinTarget | null): string | null {
  const [name, setName] = useState<string | null>(null)
  const key = target ? (target.kind === 'course' ? 'c:' + target.code : 'a:' + target.activityId) : null
  useEffect(() => {
    if (!target) return
    let live = true
    const path = target.kind === 'course'
      ? '/course-join/public-preview?code=' + encodeURIComponent(target.code)
      : `/activities/${encodeURIComponent(target.activityId)}/public-preview`
    api(path).then(
      (preview: components['schemas']['PublicJoinPreview']) => { if (live) setName(preview.course_name) },
      () => { if (live) setName(null) },
    )
    return () => { live = false }
    // key 代表 target 的內容；target 物件本身每次 render 都是新的
  }, [key])
  return name
}

/** J0: the dark banner above the login card. */
export function JoinLoginBanner({ courseName }: { courseName: string | null }) {
  const { t } = useT('join')
  return <div className="join-banner" role="status">
    <span className="join-banner__check" aria-hidden="true">✓</span>
    {courseName
      ? <span className="join-banner__text"><small>{t('login.joining')}</small><strong>{courseName}</strong></span>
      : <span className="join-banner__text"><small>{t('login.noName')}</small></span>}
  </div>
}
