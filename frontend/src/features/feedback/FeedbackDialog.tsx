import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Dialog } from '../../components/Dialog'
import { ApiError, sendFeedback, type FeedbackCreate } from '../../contract/classroomClient'
import { useT } from '../../i18n/useT'
import { Button, Chip, ChipGroup, FormError } from '../../ui'
import { useAuth } from '../auth/AuthContext'
import styles from './Feedback.module.css'
import { ACCEPT, isImageFile, prepareScreenshot, type PreparedScreenshot } from './screenshot'

type Kind = NonNullable<FeedbackCreate['kind']>
const KINDS: Kind[] = ['problem', 'suggestion', 'other']
type Status = 'idle' | 'sending' | 'failed' | 'limited'

const imageIcon = <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="2" /><path d="M21 16l-5-5-9 9" /></svg>
const crossIcon = <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
const spinnerIcon = <svg className={styles.spinner} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true"><path d="M12 3a9 9 0 1 0 9 9" /></svg>

/** 意見回饋對話框（spec P3、P5、P6、P9、P17）：送出中鎖住一切；失敗時文字與截圖都留著。 */
export function FeedbackDialog({ phone, onClose, onSent }: { phone: boolean; onClose(): void; onSent(): void }) {
  const { t, locale } = useT('feedback')
  const { status: authStatus, account } = useAuth()
  const { pathname } = useLocation()
  const showContact = authStatus !== 'ready' || account?.kind !== 'registered'
  const [kind, setKind] = useState<Kind | null>(null)
  const [message, setMessage] = useState('')
  const [contact, setContact] = useState('')
  const [shot, setShot] = useState<PreparedScreenshot | null>(null)
  const [notImage, setNotImage] = useState(false)
  const [status, setStatus] = useState<Status>('idle')
  const [preparing, setPreparing] = useState(false)
  const picker = useRef<HTMLInputElement>(null)
  // 每次選圖加一：較慢縮完的舊圖不能蓋掉後來選的新圖（新的取代舊的，P6）
  const pick = useRef(0)
  const sending = status === 'sending'

  async function attach(file: File | undefined) {
    if (!file) return
    const mine = ++pick.current
    if (!isImageFile(file)) { setNotImage(true); setPreparing(false); return }
    setNotImage(false)
    setPreparing(true)
    try {
      const prepared = await prepareScreenshot(file)
      if (mine === pick.current) setShot(prepared)
    } catch {
      if (mine === pick.current) setNotImage(true)
    } finally {
      if (mine === pick.current) setPreparing(false)
    }
  }
  function removeShot() {
    pick.current++
    setShot(null)
    setPreparing(false)
  }

  // 電腦版：對話框開著時，在任何地方貼上或拖進圖片就附加（P6）；手機只靠按鈕。
  // 掛在 document：標題列、按鈕區也收得到，拖進來的檔案也不會被瀏覽器直接打開
  const attachLatest = useRef(attach)
  attachLatest.current = attach
  const lockedLatest = useRef(sending)
  lockedLatest.current = sending
  useEffect(() => {
    if (phone) return
    const onPaste = (event: ClipboardEvent) => {
      const file = event.clipboardData?.files?.[0]
      if (!file || lockedLatest.current) return
      event.preventDefault()
      void attachLatest.current(file)
    }
    // 只攔拖進來的檔案；在說明欄裡拖曳文字照瀏覽器原本的行為
    const hasFiles = (event: DragEvent) => Array.from(event.dataTransfer?.types ?? []).includes('Files')
    const onDragOver = (event: DragEvent) => { if (hasFiles(event)) event.preventDefault() }
    const onDrop = (event: DragEvent) => {
      if (!hasFiles(event)) return
      event.preventDefault()
      if (!lockedLatest.current) void attachLatest.current(event.dataTransfer?.files?.[0])
    }
    document.addEventListener('paste', onPaste)
    document.addEventListener('dragover', onDragOver)
    document.addEventListener('drop', onDrop)
    return () => {
      document.removeEventListener('paste', onPaste)
      document.removeEventListener('dragover', onDragOver)
      document.removeEventListener('drop', onDrop)
    }
  }, [phone])

  async function submit() {
    const text = message.trim()
    if (!text || sending || preparing || authStatus === 'loading') return
    setStatus('sending')
    try {
      await sendFeedback({
        kind,
        message: text,
        contact: showContact ? contact.trim() || null : null,
        // 後端只收單一 / 開頭的站內路徑：網址開頭多打的斜線合併成一個
        page: pathname.replace(/^\/+/, '/'),
        viewport: { w: Math.max(1, Math.round(window.innerWidth)), h: Math.max(1, Math.round(window.innerHeight)) },
        locale,
        screenshot: shot ? { mime: shot.mime, data_base64: shot.dataBase64 } : null,
      })
      onSent()
    } catch (error) {
      setStatus(error instanceof ApiError && error.status === 429 ? 'limited' : 'failed')
    }
  }

  const close = () => { if (!sending) onClose() }
  const actions = <div className={phone ? styles.phoneActions : styles.actions}>
    <Button variant="outline" disabled={sending} onClick={close}>{t('cancel')}</Button>
    <Button variant="primary" disabled={sending || preparing || authStatus === 'loading' || !message.trim()} aria-busy={sending || undefined} onClick={() => { void submit() }}>
      {sending ? <>{spinnerIcon}{t('sending')}</> : t('send')}
    </Button>
  </div>

  return <Dialog title={t('title')} placement={phone ? 'bottom' : 'center'} closeOnBackdrop={false} onClose={close} footer={phone ? undefined : actions}>
    <div className={styles.body}>
      {phone && <div className={styles.phoneHeader}>
        <h3 aria-hidden="true">{t('title')}</h3>
        <button type="button" className={styles.close} aria-label={t('cancel')} disabled={sending} onClick={close}>{crossIcon}</button>
      </div>}
      <ChipGroup label={t('kindLabel')}>
        {KINDS.map(value => <Chip key={value} pressed={kind === value} disabled={sending} onClick={() => setKind(current => (current === value ? null : value))}>{t(`kind.${value}`)}</Chip>)}
      </ChipGroup>
      <label className="sr-only" htmlFor="feedback-message">{t('messageLabel')}</label>
      <textarea
        id="feedback-message"
        data-autofocus
        className={styles.message}
        placeholder={t('messagePlaceholder')}
        value={message}
        maxLength={2000}
        disabled={sending}
        onChange={event => setMessage(event.target.value)}
      />
      {shot
        ? <div className={styles.attached}>
          <span className={styles.thumb}>{imageIcon}</span>
          <span className={styles.fileText}>
            <span className={styles.fileName}>{shot.name}</span>
            <span className={styles.fileSize}>{Math.max(1, Math.round(shot.size / 1000))} KB</span>
          </span>
          <button type="button" className={styles.close} aria-label={t('removeScreenshot')} disabled={sending} onClick={removeShot}>{crossIcon}</button>
        </div>
        : <div className={styles.attachRow}>
          <Button variant="outline" disabled={sending} onClick={() => picker.current?.click()}>{imageIcon}{t('attach')}</Button>
          <span className={styles.hint}>{phone ? t('attachHintPhone') : t('attachHintDesktop')}</span>
        </div>}
      <input
        ref={picker}
        type="file"
        accept={ACCEPT}
        hidden
        onChange={event => { void attach(event.target.files?.[0]); event.target.value = '' }}
      />
      {notImage && <FormError role="alert">{t('notImage')}</FormError>}
      {showContact && <>
        <label htmlFor="feedback-contact" className={styles.hint}><b>{t('contactLabel')}</b></label>
        <input id="feedback-contact" className={styles.contact} maxLength={200} placeholder={t('contactPlaceholder')} value={contact} disabled={sending} onChange={event => setContact(event.target.value)} />
      </>}
      {(status === 'failed' || status === 'limited') && <FormError role="alert">{t(status === 'limited' ? 'rateLimited' : 'failed')}</FormError>}
      {phone && actions}
    </div>
  </Dialog>
}
