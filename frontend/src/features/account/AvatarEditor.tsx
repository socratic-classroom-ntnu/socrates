
import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type PointerEvent,
} from 'react'
import type { Account } from '../auth/AuthContext'
import { deleteAvatar, uploadAvatar, avatarSrc } from './avatarApi'
import styles from './AvatarEditor.module.css'

type Props = {
  name: string
  avatarUrl?: string | null
  onUpdated: (account: Account) => void
}

type Step = 'select' | 'crop' | 'confirm'

const MAX_FILE_SIZE = 5 * 1024 * 1024
const CROP_SIZE = 280
const OUTPUT_SIZE = 256

export function AvatarEditor({ name, avatarUrl, onUpdated }: Props) {
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<Step>('select')
  const [imageUrl, setImageUrl] = useState('')
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 })
  const [zoom, setZoom] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [preview, setPreview] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const imageRef = useRef<HTMLImageElement | null>(null)
  const dragRef = useRef<{ x: number; y: number } | null>(null)
  const objectUrlRef = useRef('')
  const previewUrlRef = useRef('')

  const baseScale = imageSize.width && imageSize.height
    ? Math.max(CROP_SIZE / imageSize.width, CROP_SIZE / imageSize.height)
    : 1

  const displayWidth = imageSize.width * baseScale * zoom
  const displayHeight = imageSize.height * baseScale * zoom

  function clampOffset(x: number, y: number, width = displayWidth, height = displayHeight) {
    const maxX = Math.max(0, (width - CROP_SIZE) / 2)
    const maxY = Math.max(0, (height - CROP_SIZE) / 2)

    return {
      x: Math.max(-maxX, Math.min(maxX, x)),
      y: Math.max(-maxY, Math.min(maxY, y)),
    }
  }

  function clearImage() {
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current)
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)

    objectUrlRef.current = ''
    previewUrlRef.current = ''
    imageRef.current = null

    setImageUrl('')
    setPreview('')
    setImageSize({ width: 0, height: 0 })
    setZoom(1)
    setOffset({ x: 0, y: 0 })

    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function closeEditor() {
    if (busy) return
    setOpen(false)
    setMenuOpen(false)
    setStep('select')
    setError('')
    clearImage()
  }

  useEffect(() => {
    if (!open) return

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !busy) closeEditor()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, busy])

  useEffect(() => {
    return () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current)
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
    }
  }, [])

  function selectFile(file?: File) {
    if (!file) return

    setError('')

    if (!['image/jpeg', 'image/png'].includes(file.type)) {
      setError('請選擇 JPG 或 PNG 圖片')
      return
    }

    if (file.size > MAX_FILE_SIZE) {
      setError('圖片大小不可超過 5 MB')
      return
    }

    const url = URL.createObjectURL(file)
    const image = new Image()

    image.onload = () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current)
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)

      objectUrlRef.current = url
      previewUrlRef.current = ''
      imageRef.current = image

      setImageUrl(url)
      setImageSize({
        width: image.naturalWidth,
        height: image.naturalHeight,
      })
      setZoom(1)
      setOffset({ x: 0, y: 0 })
      setPreview('')
      setStep('crop')
    }

    image.onerror = () => {
      URL.revokeObjectURL(url)
      setError('圖片無法讀取，請選擇其他圖片')
    }

    image.src = url
  }

  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    selectFile(event.target.files?.[0])
    event.target.value = ''
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    selectFile(event.dataTransfer.files[0])
  }

  function changeZoom(value: number) {
    const width = imageSize.width * baseScale * value
    const height = imageSize.height * baseScale * value

    setZoom(value)
    setOffset(current => clampOffset(current.x, current.y, width, height))
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (!imageUrl) return

    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = { x: event.clientX, y: event.clientY }
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!dragRef.current) return

    const dx = event.clientX - dragRef.current.x
    const dy = event.clientY - dragRef.current.y

    dragRef.current = { x: event.clientX, y: event.clientY }

    setOffset(current => clampOffset(current.x + dx, current.y + dy))
  }

  function onPointerUp() {
    dragRef.current = null
  }

  async function makeCroppedImage(): Promise<{ blob: Blob; url: string }> {
    const image = imageRef.current
    if (!image) throw new Error('IMAGE_NOT_READY')

    const canvas = document.createElement('canvas')
    canvas.width = OUTPUT_SIZE
    canvas.height = OUTPUT_SIZE

    const context = canvas.getContext('2d')
    if (!context) throw new Error('CANVAS_UNAVAILABLE')

    const ratio = OUTPUT_SIZE / CROP_SIZE
    const width = displayWidth * ratio
    const height = displayHeight * ratio
    
    context.fillStyle = '#FFFFFF'
    context.fillRect(0, 0, canvas.width, canvas.height)

    context.drawImage(
      image,
      (OUTPUT_SIZE - width) / 2 + offset.x * ratio,
      (OUTPUT_SIZE - height) / 2 + offset.y * ratio,
      width,
      height,
    )

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        result => result ? resolve(result) : reject(new Error('CROP_FAILED')),
        'image/png',
      )
    })

    return { blob, url: URL.createObjectURL(blob) }
  }

  async function confirmCrop() {
    setBusy(true)
    setError('')

    try {
      const result = await makeCroppedImage()

      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
      previewUrlRef.current = result.url

      setPreview(result.url)
      setStep('confirm')
    } catch {
      setError('裁切圖片失敗，請重新嘗試')
    } finally {
      setBusy(false)
    }
  }

  async function saveAvatar() {
    if (!preview) return

    setBusy(true)
    setError('')

    try {
      const response = await fetch(preview)
      const blob = await response.blob()
      const updated = await uploadAvatar(blob)

      onUpdated(updated)
      setBusy(false)
      closeEditor()

    } catch (error) {
    console.error('Avatar upload failed:', error)

    if (error && typeof error === 'object' && 'response' in error) {
        console.error('Backend response:', error.response)
    }

    setError('上傳失敗，請稍後再試')
    setBusy(false)
    }

  }

  async function removeAvatar() {
    if (!avatarUrl || busy) return

    setBusy(true)
    setError('')

    try {
      const updated = await deleteAvatar()
      onUpdated(updated)
      setBusy(false)
      closeEditor()
    } catch {
      setError('刪除頭像失敗，請稍後再試')
      setBusy(false)
    }
  }

  return (
    <>
      <div className={styles.editorTrigger}>
        <button
          type="button"
          className={styles.avatarButton}
          onClick={() => setMenuOpen(value => !value)}
          aria-label="編輯頭像"
          aria-expanded={menuOpen}
        >
          {avatarUrl ? (
            <img src={avatarSrc(avatarUrl)} alt="" className={styles.currentAvatar} />
          ) : (
            <span className={styles.defaultAvatar}>
              {name.slice(0, 1).toUpperCase()}
            </span>
          )}
          
        <span className={styles.editBadge} aria-hidden="true">
        <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L9 17l-4 1 1-4L16.5 3.5z" />
        </svg>
        </span>

        </button>

        {menuOpen && (
          <div className={styles.menu}>
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false)
                setError('')
                setOpen(true)
                setStep('select')
              }}
            >
              更換圖片
            </button>

            {avatarUrl && (
              <button
                type="button"
                className={styles.deleteOption}
                disabled={busy}
                onClick={() => void removeAvatar()}
              >
                刪除圖片
              </button>
            )}
          </div>
        )}

        {!open && error && <p className={styles.error} role="alert">{error}</p>}
      </div>

      {open && (
        <div
          className={styles.backdrop}
          onMouseDown={event => {
            if (event.target === event.currentTarget) closeEditor()
          }}
        >
          <section
            className={styles.modal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="avatar-editor-title"
          >
            <header className={styles.modalHeader}>
              <h2 id="avatar-editor-title">編輯個人頭像</h2>
              <button
                type="button"
                className={styles.closeButton}
                onClick={closeEditor}
                disabled={busy}
                aria-label="關閉"
              >
                ×
              </button>
            </header>

            <div className={styles.steps}>
              {[
                ['select', '01 選擇圖片'],
                ['crop', '02 裁切調整'],
                ['confirm', '03 確認圖片'],
              ].map(([value, label]) => (
                <span
                  key={value}
                  className={step === value ? styles.activeStep : styles.step}
                >
                  {label}
                </span>
              ))}
            </div>

            <div className={styles.modalBody}>
              {step === 'select' && (
                <div
                  className={styles.dropZone}
                  onDragOver={event => event.preventDefault()}
                  onDrop={onDrop}
                >
                  <span className={styles.uploadIcon} aria-hidden="true">↑</span>
                  <p>拖曳圖片至此處，或選擇電腦中的圖片</p>
                  <p className={styles.hint}>支援 JPG、PNG，檔案大小不超過 5 MB</p>
                  <button
                    type="button"
                    className={styles.primaryButton}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    選擇圖片
                  </button>
                </div>
              )}

              {step === 'crop' && (
                <div className={styles.cropSection}>
                  <p className={styles.instruction}>
                    拖曳圖片調整位置，使用下方滑桿縮放圖片。
                  </p>

                  <div
                    className={styles.cropViewport}
                    onPointerDown={onPointerDown}
                    onPointerMove={onPointerMove}
                    onPointerUp={onPointerUp}
                    onPointerCancel={onPointerUp}
                    role="img"
                    aria-label="可拖曳調整位置的頭像裁切區"
                  >
                    {imageUrl && (
                      <img
                        src={imageUrl}
                        alt=""
                        draggable={false}
                        className={styles.cropImage}
                        style={{
                          width: displayWidth,
                          height: displayHeight,
                          transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px))`,
                        }}
                      />
                    )}
                    <div className={styles.cropMask} aria-hidden="true" />
                  </div>

                  <label className={styles.zoomLabel} htmlFor="avatar-zoom">
                    縮放比例：{Math.round(zoom * 100)}%
                  </label>
                  <input
                    id="avatar-zoom"
                    type="range"
                    min="1"
                    max="3"
                    step="0.01"
                    value={zoom}
                    onChange={event => changeZoom(Number(event.target.value))}
                    className={styles.zoomSlider}
                  />
                </div>
              )}

              {step === 'confirm' && (
                <div className={styles.confirmSection}>
                  <p>確認這張圖片作為你的個人頭像？</p>
                  <img src={preview} alt="裁切後的頭像預覽" className={styles.preview} />
                  <p className={styles.hint}>圖片將儲存為 256 × 256 PNG</p>
                </div>
              )}

              {error && <p className={styles.error} role="alert">{error}</p>}
            </div>

            <footer className={styles.footer}>
              {step === 'select' ? (
                <button type="button" className={styles.secondaryButton} onClick={closeEditor}>
                  取消
                </button>
              ) : (
                <button
                  type="button"
                  className={styles.secondaryButton}
                  disabled={busy}
                  onClick={() => {
                    setError('')
                    setStep(step === 'confirm' ? 'crop' : 'select')
                  }}
                >
                  上一步
                </button>
              )}

              {step === 'crop' && (
                <button
                  type="button"
                  className={styles.primaryButton}
                  disabled={busy}
                  onClick={() => void confirmCrop()}
                >
                  下一步
                </button>
              )}

              {step === 'confirm' && (
                <button
                  type="button"
                  className={styles.primaryButton}
                  disabled={busy}
                  onClick={() => void saveAvatar()}
                >
                  {busy ? '儲存中…' : '確認儲存'}
                </button>
              )}
            </footer>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg"
              className={styles.hiddenInput}
              onChange={onFileChange}
            />
          </section>
        </div>
      )}
    </>
  )
}
