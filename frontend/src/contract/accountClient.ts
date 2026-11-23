import { typedApi } from './classroomClient'
import type { components } from './classroomTypes'

type AvatarVersion = Pick<components['schemas']['AccountView'], 'avatar_updated_at'>

function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).split(',', 2)[1] ?? '')
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

/** 頭像：前端裁好、壓成 JPEG 的小圖，跟意見回饋截圖一樣用 base64 JSON 上傳，存在資料庫。 */
export async function uploadAvatar(image: Blob) {
  const mime = image.type === 'image/png' ? 'image/png' : 'image/jpeg'
  return typedApi('/account/avatar', 'PUT', { body: { mime, data_base64: await toBase64(image) } })
}

export async function deleteAvatar() {
  return typedApi('/account/avatar', 'DELETE')
}

/** 給 <img> 的網址；帶上版本，換了頭像瀏覽器才會重新讀。沒有頭像就沒有網址。 */
export function avatarSrc(account: Partial<AvatarVersion> | null | undefined): string | undefined {
  const version = account?.avatar_updated_at
  return version == null ? undefined : `/api/v2/account/avatar?v=${version}`
}
