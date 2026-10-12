import { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from '../api/classroomClient'
import '../styles/email-verification.css'

function textOf(error) {
  return error instanceof Error ? error.message : String(error)
}

function stateLabel(value) {
  return {
    QUEUED: '驗證信已排入寄送',
    SENDING: '驗證信正在送達',
    ACCEPTED: 'Email Provider 已接收',
    SENT: '驗證信已送出',
    DELIVERED: '驗證信已送達',
    DELIVERY_DELAYED: '驗證信持續配送中',
    RETRY_SCHEDULED: '驗證信已排入下一次配送',
    AUTHORITY_RECEIPT_REQUIRED: '寄件服務正在完成授權',
    READY_TO_REQUEST: '可寄送新的驗證信',
  }[value] || value || '驗證流程已準備'
}

export function VerificationGate({ user, onVerified }) {
  const [status, setStatus] = useState(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [cooldown, setCooldown] = useState(0)

  const refresh = useCallback(async () => {
    try {
      const value = await api('/auth/verification-status')
      setStatus(value)
      if (value.verified) onVerified?.()
      return value
    } catch (error) {
      setNote(textOf(error))
      return null
    }
  }, [onVerified])

  useEffect(() => {
    let active = true
    const token = new URLSearchParams(location.search).get('verify_token')
    async function start() {
      if (token) {
        setBusy(true)
        try {
          await api('/auth/verify', 'POST', { token })
          history.replaceState({}, '', location.pathname)
          setNote('Email 驗證完成，完整課堂權限已啟用。')
          await refresh()
        } catch (error) {
          setNote(`${textOf(error)} 你可以寄送一封新的驗證信。`)
        } finally {
          setBusy(false)
        }
      } else {
        await refresh()
      }
    }
    void start()
    const timer = window.setInterval(() => {
      if (active) void refresh()
    }, 4000)
    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [refresh])

  useEffect(() => {
    if (cooldown <= 0) return undefined
    const timer = window.setInterval(
      () => setCooldown(value => Math.max(0, value - 1)),
      1000,
    )
    return () => window.clearInterval(timer)
  }, [cooldown])

  async function resend() {
    setBusy(true)
    try {
      await api('/auth/verification-email', 'POST', { email: user.email })
      setCooldown(30)
      setNote('新的驗證信已排入寄送。')
      await refresh()
    } catch (error) {
      setNote(textOf(error))
    } finally {
      setBusy(false)
    }
  }

  const delivery = status?.delivery || {}
  const label = useMemo(
    () => stateLabel(delivery.provider_status || delivery.state),
    [delivery.provider_status, delivery.state],
  )

  return (
    <main className="r104-verify-shell">
      <section className="r2-glass r104-verify-card">
        <small>EMAIL VERIFICATION</small>
        <h1>完成 Email 驗證</h1>
        <p>
          驗證連結會寄到 <strong>{status?.email_masked || user.email_masked || user.email}</strong>。
          完成後，教師工作室、加入教室與課堂操作會在同一個 Session 中啟用。
        </p>

        <div className="r104-delivery-state" aria-live="polite">
          <span className="r104-pulse" />
          <div>
            <strong>{label}</strong>
            {delivery.provider_message_id && (
              <small>
                {delivery.provider || 'mail'} · {delivery.provider_message_id}
              </small>
            )}
          </div>
        </div>

        <div className="r2-row">
          <button
            type="button"
            disabled={busy || cooldown > 0}
            onClick={() => void resend()}
          >
            {cooldown > 0 ? `${cooldown} 秒後可再次寄送` : '重新寄送驗證信'}
          </button>
          <button
            type="button"
            className="quiet"
            onClick={() => void refresh()}
          >
            更新狀態
          </button>
          <button
            type="button"
            className="quiet"
            onClick={() =>
              void api('/auth/logout', 'POST').then(() => location.reload())
            }
          >
            登出
          </button>
        </div>

        {delivery.preview_url && (
          <a className="r104-local-preview" href={delivery.preview_url}>
            Local fixture：開啟本次驗證連結
          </a>
        )}

        <p role="status">{note}</p>
      </section>
    </main>
  )
}
