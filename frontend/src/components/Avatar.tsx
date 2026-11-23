import { useState } from 'react'

type AvatarProps = {
  name: string
  size?: 'md' | 'lg'
  /** 有頭像就顯示圖片；讀不到圖片時退回名字的第一個字。 */
  src?: string | null
}

export function Avatar({ name, size = 'md', src }: AvatarProps) {
  const [failed, setFailed] = useState<string | null>(null)
  const showImage = Boolean(src) && failed !== src
  return (
    <span className={`app-shell__avatar app-shell__avatar--${size}`} aria-hidden="true">
      {showImage
        ? <img className="app-shell__avatar-image" src={src!} alt="" onError={() => setFailed(src ?? null)} />
        : name.slice(0, 1).toUpperCase()}
    </span>
  )
}
