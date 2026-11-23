
import { api, http } from '../../contract/classroomClient'
import type { Account } from '../auth/AuthContext'

// 將後端回傳的頭像路徑轉換成前端可使用的網址
export function avatarSrc(
  url: string | null | undefined,
): string | undefined {
  if (!url) return undefined
  return `/api/v2${url}`
}

// 上傳裁切後的頭像
export async function uploadAvatar(file: Blob): Promise<Account> {
  const form = new FormData()
  form.append('file', file, 'avatar.png')

  const response = await http.post<Account>(
    '/account/avatar',
    form,
    {
      headers: {
        'Content-Type': false,
      },
    },
  )

  return response.data
}

// 刪除目前的頭像
export async function deleteAvatar(): Promise<Account> {
  return api('/account/avatar', 'DELETE')
}
