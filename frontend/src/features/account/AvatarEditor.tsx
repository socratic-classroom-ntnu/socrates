import { useEffect, useRef, useState, type ChangeEvent, type DragEvent, type PointerEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Avatar } from '../../components/Avatar'
import { Dialog } from '../../components/Dialog'
import { Menu, type MenuItem } from '../../components/Menu'
import { deleteAvatar, uploadAvatar } from '../../contract/accountClient'
import { useT } from '../../i18n/useT'
import { useIsPhone } from '../../shared/useIsPhone'
import { Button, FormError } from '../../ui'
import type { Account } from '../auth/AuthContext'
import { AccountFrame, type FrameVariant } from './AccountFrame'
import { cropToJpeg, loadImage } from './avatarImage'
import styles from './AvatarEditor.module.css'

// 原圖上限 10 MB（需求：Figma 寫的 5 GB 是筆誤），只收 JPG、PNG
const MAX_FILE_SIZE = 10 * 1024 * 1024
const ACCEPTED = ['image/jpeg', 'image/png']
const CROP_SIZE = 280
const PREVIEW_SIZE = 52
const MIN_ZOOM = 1
const MAX_ZOOM = 3
const ZOOM_STEP = 0.1

type Step = 'select' | 'rejected' | 'crop' | 'confirm'
type Rejection = { kind: 'tooLarge' | 'format' | 'unreadable'; name: string; size: number; ext: string }

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}

function extension(file: File): string {
  const fromName = file.name.includes('.') ? file.name.split('.').pop() : ''
  return (fromName || file.type.split('/').pop() || '').toUpperCase()
}

type FlowProps = {
  /** 電腦版是對話框，手機是 /account/avatar 內頁（Figma M02–M07） */
  variant: FrameVariant
  name: string
  onUpdated: (account: Account) => void
  onClose: () => void
}

/** 更換頭像：選擇圖片 → 檢查（超過上限、格式錯誤）→ 圓形裁切 → 確認 → 儲存。 */
export function AvatarFlow({ variant, name, onUpdated, onClose }: FlowProps) {
  const { t } = useT('shell')
  const tr = (key: string, values?: Record<string, string>) => t(`accountSettings.avatar.${key}`, values)
  const [step, setStep] = useState<Step>('select')
  const [rejection, setRejection] = useState<Rejection | null>(null)
  const [imageUrl, setImageUrl] = useState('')
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 })
  const [zoom, setZoom] = useState(MIN_ZOOM)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [preview, setPreview] = useState('')
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<'' | 'cropFailed' | 'uploadFailed'>('')

  const fileInput = useRef<HTMLInputElement>(null)
  const image = useRef<HTMLImageElement | null>(null)
  const drag = useRef<{ x: number; y: number } | null>(null)
  const urls = useRef<string[]>([])
  // 裁好的 JPEG；存檔時直接上傳這份
  const cropped = useRef<Blob | null>(null)

  useEffect(() => () => { urls.current.forEach(url => URL.revokeObjectURL(url)) }, [])

  function objectUrl(blob: Blob): string {
    const url = URL.createObjectURL(blob)
    urls.current.push(url)
    return url
  }

  const baseScale = imageSize.width && imageSize.height
    ? Math.max(CROP_SIZE / imageSize.width, CROP_SIZE / imageSize.height)
    : 1
  const displayWidth = imageSize.width * baseScale * zoom
  const displayHeight = imageSize.height * baseScale * zoom

  function clamp(x: number, y: number, width = displayWidth, height = displayHeight) {
    const maxX = Math.max(0, (width - CROP_SIZE) / 2)
    const maxY = Math.max(0, (height - CROP_SIZE) / 2)
    return { x: Math.max(-maxX, Math.min(maxX, x)), y: Math.max(-maxY, Math.min(maxY, y)) }
  }

  async function selectFile(file?: File) {
    if (!file) return
    setFailure('')
    const facts = { name: file.name, size: file.size, ext: extension(file) }
    if (!ACCEPTED.includes(file.type)) { setRejection({ kind: 'format', ...facts }); setStep('rejected'); return }
    if (file.size > MAX_FILE_SIZE) { setRejection({ kind: 'tooLarge', ...facts }); setStep('rejected'); return }
    const url = objectUrl(file)
    try {
      const loaded = await loadImage(url)
      image.current = loaded
      setImageUrl(url)
      setImageSize({ width: loaded.naturalWidth, height: loaded.naturalHeight })
      setZoom(MIN_ZOOM)
      setOffset({ x: 0, y: 0 })
      setRejection(null)
      setStep('crop')
    } catch {
      setRejection({ kind: 'unreadable', ...facts })
      setStep('rejected')
    }
  }

  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    void selectFile(event.target.files?.[0])
    event.target.value = ''
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    void selectFile(event.dataTransfer.files[0])
  }

  function changeZoom(value: number) {
    const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(value * 100) / 100))
    setZoom(next)
    setOffset(current => clamp(current.x, current.y, imageSize.width * baseScale * next, imageSize.height * baseScale * next))
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture?.(event.pointerId)
    drag.current = { x: event.clientX, y: event.clientY }
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!drag.current) return
    const dx = event.clientX - drag.current.x
    const dy = event.clientY - drag.current.y
    drag.current = { x: event.clientX, y: event.clientY }
    setOffset(current => clamp(current.x + dx, current.y + dy))
  }

  async function confirmCrop() {
    if (!image.current) return
    setBusy(true)
    setFailure('')
    try {
      const blob = await cropToJpeg(image.current, { frame: CROP_SIZE, width: displayWidth, height: displayHeight, x: offset.x, y: offset.y })
      cropped.current = blob
      setPreview(objectUrl(blob))
      setStep('confirm')
    } catch {
      setFailure('cropFailed')
    } finally {
      setBusy(false)
    }
  }

  async function save() {
    if (!cropped.current) return
    setBusy(true)
    setFailure('')
    try {
      onUpdated(await uploadAvatar(cropped.current))
      setBusy(false)
      onClose()
    } catch {
      setFailure('uploadFailed')
      setBusy(false)
    }
  }

  const close = () => { if (!busy) onClose() }
  const chooseFile = () => fileInput.current?.click()
  const titleKey = { select: 'selectTitle', rejected: 'rejectedTitle', crop: 'cropTitle', confirm: 'confirmTitle' }[step]
  const current = step === 'rejected' ? 'select' : step
  const placed = (scale: number) => ({
    width: displayWidth * scale,
    height: displayHeight * scale,
    transform: `translate(calc(-50% + ${offset.x * scale}px), calc(-50% + ${offset.y * scale}px))`,
  })

  const footer = step === 'select' ? <Button variant="outline" onClick={close}>{tr('cancel')}</Button>
    : step === 'rejected' ? <>
      <Button variant="outline" onClick={close}>{tr('cancel')}</Button>
      <Button variant="primary" onClick={chooseFile}>{tr('chooseAgain')}</Button>
    </>
    : step === 'crop' ? <>
      <Button variant="outline" disabled={busy} onClick={chooseFile}>{tr('reselect')}</Button>
      <Button variant="primary" disabled={busy} onClick={() => void confirmCrop()}>{tr('confirmCrop')}</Button>
    </>
    : <>
      <Button variant="outline" disabled={busy} onClick={() => { setFailure(''); setStep('crop') }}>{tr('backToCrop')}</Button>
      <Button variant="primary" disabled={busy} onClick={() => void save()}>{busy ? tr('saving') : tr('save')}</Button>
    </>

  return <AccountFrame
    variant={variant}
    title={tr(titleKey)}
    onClose={close}
    closeOnBackdrop={!busy}
    footer={footer}
    steps={<ol className={styles.steps}>
      {(['select', 'crop', 'confirm'] as const).map((key, index) => (
        <li key={key} className={current === key ? styles.activeStep : styles.step} aria-current={current === key ? 'step' : undefined}>
          {`${index + 1} ${tr(`steps.${key}`)}`}
        </li>
      ))}
    </ol>}
  >
    {step === 'select' && (
      <div className={styles.dropZone} onDragOver={event => event.preventDefault()} onDrop={onDrop}>
        <p className={styles.dropTitle}>{tr('selectHeading')}</p>
        <p className={styles.hint}>{tr('limits')}</p>
        <Button variant="primary" onClick={chooseFile}>{tr('choose')}</Button>
      </div>
    )}

    {step === 'rejected' && rejection && (
      <div className={styles.rejected}>
        <div className={styles.fileCard}>
          <span className={styles.fileType}>{rejection.ext}</span>
          <span className={styles.fileFacts}>
            <span className={styles.fileName}>{rejection.name}</span>
            <span className={styles.hint}>{formatSize(rejection.size)}</span>
          </span>
        </div>
        <div className={styles.reason} role="alert">
          <p className={styles.reasonTitle}>{tr(`${rejection.kind}Title`)}</p>
          <p>{tr(`${rejection.kind}Body`, { size: formatSize(rejection.size), ext: rejection.ext })}</p>
        </div>
      </div>
    )}

    {step === 'crop' && (
      <div className={styles.cropSection}>
        <p className={styles.hint}>{tr('cropHint')}</p>
        <div
          className={styles.cropViewport}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={() => { drag.current = null }}
          onPointerCancel={() => { drag.current = null }}
          role="img"
          aria-label={tr('cropArea')}
        >
          {imageUrl && <img src={imageUrl} alt="" draggable={false} className={styles.cropImage} style={placed(1)} />}
          <div className={styles.cropMask} aria-hidden="true" />
        </div>
        <div className={styles.previewRow}>
          <span className={styles.livePreview} aria-hidden="true">
            {imageUrl && <img src={imageUrl} alt="" className={styles.cropImage} style={placed(PREVIEW_SIZE / CROP_SIZE)} />}
          </span>
          <span className={styles.previewText}>
            <span>{tr('preview')}</span>
            <span className={styles.hint}>{tr('previewHint')}</span>
          </span>
          <Button variant="outline" onClick={() => { setZoom(MIN_ZOOM); setOffset({ x: 0, y: 0 }) }}>{tr('reset')}</Button>
        </div>
        <div className={styles.zoomRow}>
          <label htmlFor="avatar-zoom">{tr('zoom')}</label>
          <span>{Math.round(zoom * 100)}%</span>
        </div>
        <div className={styles.zoomControls}>
          <button type="button" className={styles.zoomButton} aria-label={tr('zoomOut')} onClick={() => changeZoom(zoom - ZOOM_STEP)}>−</button>
          <input
            id="avatar-zoom"
            type="range"
            min={MIN_ZOOM}
            max={MAX_ZOOM}
            step="0.01"
            value={zoom}
            onChange={event => changeZoom(Number(event.target.value))}
            className={styles.zoomSlider}
          />
          <button type="button" className={styles.zoomButton} aria-label={tr('zoomIn')} onClick={() => changeZoom(zoom + ZOOM_STEP)}>＋</button>
        </div>
      </div>
    )}

    {step === 'confirm' && (
      <div className={styles.confirmSection}>
        <img src={preview} alt={tr('previewAlt')} className={styles.preview} />
        <p className={styles.confirmName}>{name}</p>
        <p className={styles.hint}>{tr('savedAs')}</p>
      </div>
    )}

    {failure && <FormError role="alert">{tr(failure)}</FormError>}

    <input ref={fileInput} type="file" accept="image/png,image/jpeg" className={styles.hiddenInput} onChange={onFileChange} />
  </AccountFrame>
}

type EditorProps = {
  name: string
  /** avatarSrc(account)：目前頭像的網址，沒有頭像是 undefined */
  avatarUrl?: string
  onUpdated: (account: Account) => void
}

/**
 * 個人設定頁上的頭像與「Edit」。電腦版點了是小選單（Figma 頭像操作選單），手機是下方選單（M01），
 * 「更換圖片」在電腦開對話框、在手機進 /account/avatar。
 */
export function AvatarEditor({ name, avatarUrl, onUpdated }: EditorProps) {
  const { t } = useT('shell')
  const tr = (key: string) => t(`accountSettings.avatar.${key}`)
  const phone = useIsPhone()
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)
  const [flowOpen, setFlowOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [removeFailed, setRemoveFailed] = useState(false)

  function change() {
    setMenuOpen(false)
    if (phone) navigate('/account/avatar')
    else setFlowOpen(true)
  }

  async function remove() {
    if (busy) return
    setBusy(true)
    setRemoveFailed(false)
    try {
      onUpdated(await deleteAvatar())
      setMenuOpen(false)
    } catch {
      setRemoveFailed(true)
    } finally {
      setBusy(false)
    }
  }

  const badge = <>
    <Avatar name={name} src={avatarUrl} size="lg" />
    <span className={styles.editBadge}>{tr('edit')}</span>
  </>
  const items: MenuItem[] = [
    { key: 'change', label: tr('change'), onSelect: change },
    ...(avatarUrl ? [{ key: 'remove', label: tr('remove'), danger: true, onSelect: () => void remove() }] : []),
  ]

  return <div className={styles.editorTrigger}>
    {phone ? (
      <button
        type="button"
        className={styles.avatarButton}
        onClick={() => setMenuOpen(open => !open)}
        aria-haspopup="dialog"
        aria-expanded={menuOpen}
        disabled={busy && !menuOpen}
      >
        {badge}
      </button>
    ) : (
      // 電腦版：共用的 Menu（方向鍵、Enter、Esc、點外面關閉都在裡面）；刪除進行中不能再開
      <Menu label={tr('edit')} trigger={badge} items={items} triggerClassName={styles.avatarButton} disabled={busy} />
    )}

    {menuOpen && phone && (
      <Dialog title={tr('menuTitle')} placement="bottom" closeOnBackdrop={!busy} onClose={() => { if (!busy) setMenuOpen(false) }}>
        <div className={styles.sheet}>
          <p className={styles.sheetTitle} aria-hidden="true">{tr('menuTitle')}</p>
          <Button variant="primary" disabled={busy} onClick={change}>{tr('change')}</Button>
          {avatarUrl && <Button variant="outline" className={styles.sheetDelete} disabled={busy} onClick={() => void remove()}>{tr('remove')}</Button>}
          <Button variant="quiet" disabled={busy} onClick={() => setMenuOpen(false)}>{tr('cancel')}</Button>
          {removeFailed && <FormError role="alert">{tr('removeFailed')}</FormError>}
        </div>
      </Dialog>
    )}

    {removeFailed && !(menuOpen && phone) && <FormError role="alert">{tr('removeFailed')}</FormError>}

    {flowOpen && <AvatarFlow variant="dialog" name={name} onUpdated={onUpdated} onClose={() => setFlowOpen(false)} />}
  </div>
}
