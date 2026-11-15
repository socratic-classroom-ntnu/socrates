import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useT } from '../../../i18n/useT'
import { Button } from '../../../ui'
import type { ScanNotice, ScanNoticeState } from './scanNotice'
import { useCamera } from './useCamera'
import { useQrScanner } from './useQrScanner'
import styles from './ScanPage.module.css'

type Phase = 'opening' | 'scanning'

/**
 * 全螢幕掃描頁（S2–S5）。一打開就是 S2 並要相機；有畫面之後進入掃描。
 * 離開一律用 replace：學生之後按上一頁不會回到這裡、不會再要一次相機。
 */
export function ScanPage() {
  const { t } = useT('home')
  const { t: tc } = useT('common')
  const navigate = useNavigate()
  const video = useRef<HTMLVideoElement>(null)
  const frame = useRef<HTMLDivElement>(null)
  const [phase, setPhase] = useState<Phase>('opening')

  function leave(notice?: ScanNotice) {
    const state: ScanNoticeState | undefined = notice ? { scanNotice: notice } : undefined
    navigate('/', { replace: true, state })
  }

  useCamera(video, () => setPhase('scanning'), leave)
  useQrScanner(video, frame, phase === 'scanning', () => {}, () => leave('unavailable'))

  return <main className={styles.page} data-phase={phase}>
    <video ref={video} className={styles.video} data-phase={phase} autoPlay playsInline muted aria-hidden="true" />
    <div className={styles.top}>
      <button type="button" className={styles.close} aria-label={tc('close')} onClick={() => leave()}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
      </button>
    </div>
    <div className={styles.heading}>
      {phase === 'scanning' && <h1 className={styles.title}>{t('scan.page.aimTitle')}</h1>}
    </div>
    <div className={styles.middle}>
      {phase === 'scanning' && <div ref={frame} className={styles.frame} data-testid="scan-frame" data-state="aiming" aria-hidden="true">
        <span className={styles.corner} /><span className={styles.corner} /><span className={styles.corner} /><span className={styles.corner} />
      </div>}
      {phase === 'opening' && <div className={styles.opening} role="status">
        <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true"><path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M7 12h10" /></svg>
        <p className={styles.openingTitle}>{t('scan.page.openingTitle')}</p>
        <p className={styles.openingBody}>{t('scan.page.openingBody')}</p>
      </div>}
    </div>
    <div className={styles.bottom}>
      <p className={styles.hint}>{t('scan.page.hint')}</p>
      <Button className={styles.useCode}>
        {t('scan.page.useCode')}
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
      </Button>
    </div>
  </main>
}
