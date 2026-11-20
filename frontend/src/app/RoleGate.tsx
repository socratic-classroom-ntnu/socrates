import { Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../features/auth/AuthContext'
import { AppShell } from './AppShell'
import { CrossRolePage } from './CrossRolePage'
import { pageSide } from './pageSide'

/**
 * 帳號只有一個角色（P15、P16）：放在登入／驗證守門的裡面，所以順序是先登入、再驗證、再看角色；
 * 手機檢查（TeacherDesktopOnly）在它裡面，所以先看角色、再看手機。
 * 角色不符時不 render 原頁面（頁面一 render 就會打 API），在原網址、外框裡顯示說明頁，
 * 原本全螢幕的頁面（加入、對話、投影）也一樣包進外框。
 */
export function RoleGate() {
  const { account } = useAuth()
  const { pathname } = useLocation()
  const side = pageSide(pathname)
  if (!side || !account || account.account_role === side) return <Outlet />
  return <AppShell><CrossRolePage side={side} /></AppShell>
}
