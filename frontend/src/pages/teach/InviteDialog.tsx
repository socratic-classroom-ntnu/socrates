import { Link } from 'react-router-dom'
import { CopyButton } from '../../components/CopyButton'
import { Dialog } from '../../components/Dialog'
import { QrCode } from '../../components/QrCode'
import { useT } from '../../i18n/useT'

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
}

/** T2b: course or activity QR with the code and a copyable link. */
export function InviteDialog({ kind, name, url, code, projectorTo, onClose, disabled = false }: Props) {
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
        <CopyButton text={code} label={t('invite.copyCode')} iconOnly className="icon-button" />
      </div>}
      <div className="invite__actions">
        <Link className="button button--dark" to={projectorTo}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M8 20h8M12 16v4" /></svg>
          {t('invite.projector')}
        </Link>
        <CopyButton text={url} label={kind === 'course' ? t('invite.copyCourseLink') : t('invite.copyActivityLink')} className="button button--outline" />
      </div>
    </div>}
  </Dialog>
}
