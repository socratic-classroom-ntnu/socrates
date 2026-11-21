import { type ReactNode, type RefObject, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Dialog } from '../../../components/Dialog'
import { useT } from '../../../i18n/useT'
import { Button } from '../../../ui'
import { queryCameraPermission } from './cameraPermission'
import { introSeen, markIntroSeen } from './introSeen'
import type { ScanNotice, ScanNoticeState } from './scanNotice'
import styles from './ScanButton.module.css'

type Notice = 'intro' | ScanNotice

function noticeFrom(state: unknown): ScanNotice | null {
  const notice = (state as Partial<ScanNoticeState> | null)?.scanNotice
  return notice === 'denied' || notice === 'unavailable' ? notice : null
}

/**
 * 首頁手機版的「掃描」：先看相機權限再決定去哪。已允許 → 掃描頁；已拒絕 → S6；
 * 其他情況第一次按 → Sc1（按「允許」才進掃描頁要相機），說明過之後直接進掃描頁。
 * 掃描頁被拒絕或開不起來時，會帶著 location.state 回到首頁，這裡顯示 S6／S7。
 * S6、S7 關掉後，焦點移到首頁的代碼欄（`codeField`）。
 */
export function ScanButton({ className, codeField }: { className?: string; codeField: RefObject<HTMLInputElement | null> }) {
  const { t } = useT('home')
  const navigate = useNavigate()
  const location = useLocation()
  const [notice, setNotice] = useState<Notice | null>(null)
  const checking = useRef(false)
  const focusCode = useRef(false)

  // state 會跟著瀏覽器的歷史紀錄留下來，讀到就清掉：重新整理後才不會再跳出來
  useEffect(() => {
    const arrived = noticeFrom(location.state)
    if (!arrived) return
    setNotice(arrived)
    navigate(location.pathname + location.search + location.hash, { replace: true, state: null })
  }, [location, navigate])

  // 對話框關掉時會把焦點還給打開它的元素；這個 effect 在那之後才跑，焦點才留得在代碼欄
  useEffect(() => {
    if (notice === null && focusCode.current) {
      focusCode.current = false
      codeField.current?.focus()
    }
  }, [notice, codeField])

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

  function useCodeInstead() {
    focusCode.current = true
    setNotice(null)
  }

  function retry() {
    setNotice(null)
    void start()
  }

  const problemFooter = <>
    <Button variant="outline" onClick={useCodeInstead}>{t('scan.problem.useCode')}</Button>
    <Button variant="primary" data-autofocus onClick={retry}>{t('scan.problem.retry')}</Button>
  </>

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
    {notice === 'denied' && <Dialog title={t('scan.denied.title')} onClose={useCodeInstead} footer={problemFooter}>
      <p className="dialog__text">{t('scan.denied.body')}</p>
      <ul className={styles.ways}>
        <Way icon={<SettingsIcon />} title={t('scan.denied.iphoneTitle')} body={t('scan.denied.iphoneSteps')} />
        <Way icon={<SettingsIcon />} title={t('scan.denied.androidTitle')} body={t('scan.denied.androidSteps')} />
      </ul>
    </Dialog>}
    {notice === 'unavailable' && <Dialog title={t('scan.unavailable.title')} onClose={useCodeInstead} footer={problemFooter}>
      <p className="dialog__text">{t('scan.unavailable.body')}</p>
      <ul className={styles.ways}>
        <Way icon={<ScanIcon />} title={t('scan.unavailable.cameraTitle')} body={t('scan.unavailable.cameraBody')} />
        <Way icon={<GlobeIcon />} title={t('scan.unavailable.browserTitle')} body={t('scan.unavailable.browserBody')} />
      </ul>
    </Dialog>}
  </>
}

function Way({ icon, title, body }: { icon: ReactNode; title: string; body: string }) {
  return <li className={styles.way}>
    <span className={styles.wayIcon} aria-hidden="true">{icon}</span>
    <span className={styles.wayText}><strong>{title}</strong><span>{body}</span></span>
  </li>
}

const ICON = { width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }

function SettingsIcon() {
  return <svg {...ICON}><circle cx="12" cy="12" r="3" /><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1" /></svg>
}
function ScanIcon() {
  return <svg {...ICON}><path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M7 12h10" /></svg>
}
function GlobeIcon() {
  return <svg {...ICON}><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z" /></svg>
}
