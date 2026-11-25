import { Navigate, useNavigate } from 'react-router-dom'
import { accountName } from '../../shared/accountName'
import { useIsPhone } from '../../shared/useIsPhone'
import { useAuth } from '../auth/AuthContext'
import { AvatarFlow } from './AvatarEditor'
import { ChangePasswordDialog } from './ChangePasswordDialog'
import { DeleteAccountDialog } from './DeleteAccountDialog'

/** 從內頁回到設定頁時帶的結果，設定頁顯示成功提示（手機改完密碼回到 M00）。 */
export type AccountNotice = { notice: 'passwordUpdated' }

/**
 * 手機的個人設定內頁（/account/avatar、/account/password、/account/delete）。
 * 訪客回首頁；電腦寬度沒有內頁，回 /account（那邊用對話框）。
 */
export function AccountSubpage({ kind }: { kind: 'avatar' | 'password' | 'delete' }) {
  const { account, replaceAccount } = useAuth()
  const phone = useIsPhone()
  const navigate = useNavigate()
  if (!account) return null
  if (account.kind === 'guest' || account.kind === 'expired_guest') return <Navigate to="/" replace />
  if (!phone) return <Navigate to="/account" replace />

  const back = () => navigate('/account')
  if (kind === 'avatar') {
    return <AvatarFlow variant="page" name={accountName(account)} onUpdated={replaceAccount} onClose={back} />
  }
  if (kind === 'password') {
    const done: AccountNotice = { notice: 'passwordUpdated' }
    return <ChangePasswordDialog variant="page" onClose={back} onSuccess={() => navigate('/account', { state: done })} />
  }
  return <DeleteAccountDialog variant="page" username={account.username} onClose={back} />
}
