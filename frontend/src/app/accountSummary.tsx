import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../features/auth/AuthContext'
import { GuestLogoutDialog, useKeepUntil } from '../features/auth/GuestPanels'
import { accountName } from '../shared/accountName'
import { useT } from '../i18n/useT'

// 訪客的兩個入口：註冊升級（G16–G19）與登入併入（G20–G24），頁面在 features/auth
export const GUEST_REGISTER = '/guest/register'
export const GUEST_LOGIN = '/guest/login'

export type AccountTag = 'student' | 'teacher' | 'guest'

/** 帳號選單（電腦）與帳號面板（手機）共用：名字、角色標籤、第二行（Email 或訪客的保留日期）。 */
export function useAccountSummary() {
  const { t } = useT('shell')
  const { account } = useAuth()
  const guest = account?.kind === 'guest'
  const keep = useKeepUntil(account)
  const tag: AccountTag = guest ? 'guest' : account?.account_role === 'teacher' ? 'teacher' : 'student'
  return {
    // 訪客是暱稱（不含使用者名稱後面的亂碼）
    name: accountName(account),
    tag,
    tagLabel: t(`account.tag.${tag}`),
    guest,
    // 名字旁已有「訪客」標籤，第二行只寫保留日期（瀏覽器時區、只到日）
    secondLine: keep ? t('account.guestUntil', { date: keep.date }) : guest ? '' : account?.email ?? '',
  }
}

export function RoleTag({ tag, label }: { tag: AccountTag; label: string }) {
  return <span className={`account-tag account-tag--${tag}`}>{label}</span>
}

/** 登出：訪客先確認（G15），其他帳號直接登出。回傳的 confirm 要 render 在畫面上。 */
export function useLogout() {
  const { signOut } = useAuth()
  const navigate = useNavigate()
  const { guest } = useAccountSummary()
  const [asking, setAsking] = useState(false)

  const logout = () => void signOut().then(() => navigate('/login', { replace: true }))
  const request = () => (guest ? setAsking(true) : logout())
  const confirm = asking
    ? <GuestLogoutDialog onClose={() => setAsking(false)} onLogout={() => { setAsking(false); logout() }} />
    : null
  return { request, confirm }
}
