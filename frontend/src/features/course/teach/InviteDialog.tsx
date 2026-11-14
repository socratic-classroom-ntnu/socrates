import { useId, useState } from 'react'
import { Dialog } from '../../../components/Dialog'
import { api } from '../../../contract/classroomClient'
import type { components } from '../../../contract/classroomTypes'
import { errorMessage } from '../../../i18n/errors'
import { useT } from '../../../i18n/useT'
import { ButtonLink, CopyButton, FormError, QrCode } from '../../../ui'

type Course = components['schemas']['CourseTeacherView']

/** The course invite's guest-join switch; only the course dialog gets one. */
export type GuestJoin = { courseId: string; allowed: boolean; onSaved?(course: Course): void }

type Props = {
  kind: 'course' | 'activity'
  name: string
  /** What the QR encodes and the copy button copies; the caller builds it. */
  url: string
  code?: string
  projectorTo: string
  onClose(): void
  /** Course code turned off: explain instead of showing a QR that would not work. */
  disabled?: boolean
  guest?: GuestJoin
}

/** T2b: course or activity QR with the code and a copyable link. */
export function InviteDialog({ kind, name, url, code, projectorTo, onClose, disabled = false, guest }: Props) {
  const { t } = useT('teach')
  const title = kind === 'course' ? t('invite.courseTitle', { name }) : t('invite.activityTitle', { name })
  // 代碼停用時不說「輸入課程代碼」，免得和停用提示互相矛盾
  const description = disabled ? undefined : <p>{kind === 'course' ? t('invite.courseBody') : t('invite.activityBody')}</p>
  return <Dialog title={title} onClose={onClose} description={description}>
    {disabled ? <p className="invite__disabled">{t('invite.disabled')}</p> : <div className="invite">
      <div className="invite__qr"><QrCode value={url} alt={t('invite.qrAlt', { name })} size={192} /></div>
      {kind === 'course' && code && <div className="invite__code">
        <span className="invite__code-label">{t('invite.codeLabel')}</span>
        <span className="invite__code-value">{code}</span>
        <CopyButton text={code} label={t('invite.copyCode')} iconOnly />
      </div>}
      <div className="invite__actions">
        <ButtonLink variant="dark" to={projectorTo}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M8 20h8M12 16v4" /></svg>
          {t('invite.projector')}
        </ButtonLink>
        <CopyButton text={url} label={kind === 'course' ? t('invite.copyCourseLink') : t('invite.copyActivityLink')} variant="outline" />
      </div>
    </div>}
    {guest && <GuestJoinSwitch {...guest} />}
  </Dialog>
}

/** Saves on every flip, no confirmation; a failed save flips back and says why. */
function GuestJoinSwitch({ courseId, allowed, onSaved }: GuestJoin) {
  const { t } = useT('teach')
  const id = useId()
  const [on, setOn] = useState(allowed)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<unknown>(null)

  async function toggle() {
    const previous = on
    setOn(!previous)
    setSaving(true)
    setError(null)
    try {
      const course: Course = await api(`/courses/${courseId}`, 'PATCH', { allow_guest: !previous })
      setOn(course.allow_guest)
      onSaved?.(course)
    } catch (failure) {
      setOn(previous)
      setError(failure)
    } finally {
      setSaving(false)
    }
  }

  return <div className="invite-guest">
    <div className="invite-guest__row">
      <span id={`${id}-label`} className="invite-guest__label">{t('invite.guestLabel')}</span>
      <button type="button" role="switch" className="invite-guest__switch" aria-checked={on} aria-labelledby={`${id}-label`}
        aria-describedby={`${id}-hint`} disabled={saving} onClick={() => void toggle()}>
        <span className="invite-guest__knob" aria-hidden="true" />
      </button>
    </div>
    <p id={`${id}-hint`} className="invite-guest__hint">{on ? t('invite.guestOn') : t('invite.guestOff')}</p>
    {error !== null && <FormError role="alert">{errorMessage(t, error)}</FormError>}
  </div>
}
