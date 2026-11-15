import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useT } from '../../../i18n/useT'
import { Button, FormError } from '../../../ui'
import { joinPathFor, parseScannedQr } from './parseScannedQr'
import type { ScanNotice, ScanNoticeState } from './scanNotice'
import { FOUND_DELAY_MS } from './scanTiming'
import { useCamera } from './useCamera'
import { useQrScanner } from './useQrScanner'
import styles from './ScanPage.module.css'

type Phase = 'opening' | 'scanning' | 'found'

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
  const found = useRef(false)
  const [unknown, setUnknown] = useState(false)
  const foundTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(foundTimer.current), [])

  function leave(notice?: ScanNotice) {
    clearTimeout(foundTimer.current)
    const state: ScanNoticeState | undefined = notice ? { scanNotice: notice } : undefined
    navigate('/', { replace: true, state })
  }

  useCamera(video, () => setPhase('scanning'), leave)
  // 掃到本站的 QR：停止辨識、顯示 S4，半秒後進加入畫面。同一個 QR 一直對著鏡頭也只導頁一次；S4 期間按關閉就不導頁。
  // 不認得的 QR：S5，相機繼續開著、繼續掃，提示留到掃到本站的 QR 為止
  function onText(text: string) {
    if (found.current) return
    const qr = parseScannedQr(text, window.location.href)
    if (qr.kind === 'unknown') {
      setUnknown(true)
      return
    }
    found.current = true
    setUnknown(false)
    setPhase('found')
    foundTimer.current = setTimeout(() => navigate(joinPathFor(qr), { replace: true }), FOUND_DELAY_MS)
  }

  useQrScanner(video, frame, phase === 'scanning', onText, () => leave('unavailable'))
  const aiming = phase === 'scanning' || phase === 'found'
  const frameState = phase === 'found' ? 'found' : unknown ? 'unknown' : 'aiming'

  return <main className={styles.page} data-phase={phase}>
    <video ref={video} className={styles.video} data-phase={phase === 'opening' ? 'opening' : 'live'} autoPlay playsInline muted aria-hidden="true" />
    <div className={styles.top}>
      <button type="button" className={styles.close} aria-label={tc('close')} onClick={() => leave()}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
      </button>
    </div>
    <div className={styles.heading} aria-live="polite">
      {aiming && <h1 className={styles.title}>{t(phase === 'found' ? 'scan.page.foundTitle' : 'scan.page.aimTitle')}</h1>}
    </div>
    <div className={styles.middle}>
      {aiming && <div className={styles.frameArea}>
        <div ref={frame} className={styles.frame} data-testid="scan-frame" data-state={frameState} aria-hidden="true">
          <span className={styles.corner} /><span className={styles.corner} /><span className={styles.corner} /><span className={styles.corner} />
          {phase === 'found' && <span className={styles.check}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
          </span>}
        </div>
        {frameState === 'unknown' && <FormError role="alert" className={styles.unknown}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5.5M12 16.5v.01" /></svg>
          {t('scan.page.unknown')}
        </FormError>}
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
