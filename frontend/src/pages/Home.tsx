import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { createSession } from '../api/client'

export default function Home() {
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)

  async function start() {
    setBusy(true)
    setError(false)
    try {
      const view = await createSession('trolley')
      navigate(`/sessions/${view.session.id}`)
    } catch {
      setError(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="page">
      <h1>蘇格拉底</h1>
      <p>這裡沒有標準答案。你會被一直追問，直到你看清楚自己原本就持有的立場。</p>
      {error && <p role="alert">暫時無法開始討論，請再試一次。</p>}
      <button onClick={start} disabled={busy}>開始討論</button>
    </main>
  )
}
