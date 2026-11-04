import { useEffect, useState } from 'react'

/** QR image for a URL. The encoder is loaded on demand so pages without a QR never download it. */
export function QrCode({ value, alt, size = 192 }: { value: string; alt: string; size?: number }) {
  const [src, setSrc] = useState('')
  useEffect(() => {
    let live = true
    setSrc('')
    void import('qrcode')
      .then(module => (module.default ?? module).toDataURL(value, { margin: 1, width: 480 }))
      .then(url => { if (live) setSrc(url) })
      .catch(() => { /* the code and link below the QR still work */ })
    return () => { live = false }
  }, [value])
  if (!src) return <span className="qr-code qr-code--loading" style={{ width: size, height: size }} aria-hidden="true" />
  return <img className="qr-code" src={src} alt={alt} width={size} height={size} />
}
