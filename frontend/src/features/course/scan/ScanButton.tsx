import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Dialog } from '../../../components/Dialog'
import { useT } from '../../../i18n/useT'
import { Button } from '../../../ui'
import { queryCameraPermission } from './cameraPermission'
import { introSeen, markIntroSeen } from './introSeen'

type Notice = 'intro' | 'denied'

/**
 * 首頁手機版的「掃描」：先看相機權限再決定去哪。已允許 → 掃描頁；已拒絕 → S6；
 * 其他情況第一次按 → Sc1（按「允許」才進掃描頁要相機），說明過之後直接進掃描頁。
 */
export function ScanButton({ className }: { className?: string }) {
  const { t } = useT('home')
  const navigate = useNavigate()
  const [notice, setNotice] = useState<Notice | null>(null)
  const checking = useRef(false)

  async function start() {
    if (checking.current) return
    checking.current = true
    try {
      const permission = await queryCameraPermission()
      if (permission === 'granted') navigate('/scan')
      else if (permission === 'denied') setNotice('denied')
      else if (introSeen()) navigate('/scan')
      else {
        markIntroSeen()
        setNotice('intro')
      }
    } finally {
      checking.current = false
    }
  }

  return <>
    <Button variant="dark" className={className} onClick={() => void start()}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3" /><circle cx="12" cy="12" r="3" /></svg>
      {t('join.scan')}
    </Button>
    {notice === 'intro' && <Dialog
      title={t('scan.intro.title')}
      onClose={() => setNotice(null)}
      footer={<>
        <Button variant="outline" onClick={() => setNotice(null)}>{t('scan.intro.cancel')}</Button>
        <Button variant="primary" data-autofocus onClick={() => { setNotice(null); navigate('/scan') }}>{t('scan.intro.allow')}</Button>
      </>}
    >
      <p className="dialog__question">{t('scan.intro.question')}</p>
      <p className="dialog__text">{t('scan.intro.body')}</p>
    </Dialog>}
  </>
}
