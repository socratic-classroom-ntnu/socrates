import { useCallback, useEffect, useState } from 'react'
import { api } from '../../api/classroomClient'
import { ModelMatrix, mismatchedRoles } from './ProviderSettings'
import '../../styles/provider-settings.css'

function errorText(error) {
  return error instanceof Error ? error.message : String(error)
}

type ClassroomAISettingsProps = {
  classroomId: string
  activeRoomId?: string | null
  onSaved?: (saved: unknown) => void
}

export function ClassroomAISettings({ classroomId, activeRoomId = null, onSaved }: ClassroomAISettingsProps) {
  const [profiles, setProfiles] = useState([])
  const [settings, setSettings] = useState({
    default_profile_id: null,
    fallback_profile_id: null,
    model_matrix: {},
    budgets: {
      max_calls: 240,
      max_tokens: 1000000,
      estimated_cost_ceiling: '',
    },
  })
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(async () => {
    if (!classroomId) return
    try {
      const [nextProfiles, nextSettings] = await Promise.all([
        api('/provider-profiles'),
        api(`/library/classrooms/${classroomId}/ai-settings`),
      ])
      setProfiles(nextProfiles)
      setSettings(nextSettings)
      setNote('')
    } catch (error) {
      setNote(errorText(error))
    }
  }, [classroomId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const profile = profiles.find(item => item.id === settings.default_profile_id) || null

  async function save() {
    const mismatched = mismatchedRoles(settings.model_matrix || {}, profile)
    if (mismatched.length) {
      setNote(`這個 Provider Profile 不是 OpenRouter，請先替這些角色改選模型：${mismatched.join('、')}`)
      return
    }
    setBusy(true)
    try {
      const saved = await api(`/library/classrooms/${classroomId}/ai-settings`, 'PUT', {
        default_profile_id: settings.default_profile_id || null,
        fallback_profile_id: settings.fallback_profile_id || null,
        model_matrix: settings.model_matrix || {},
        budgets: settings.budgets || {},
        active_room_id: activeRoomId,
      })
      setSettings(saved)
      setNote('Classroom AI 設定已保存。')
      onSaved?.(saved)
    } catch (error) {
      setNote(errorText(error))
    } finally {
      setBusy(false)
    }
  }

  if (!classroomId) return null

  return (
    <details className="sc-card classroom-ai" open>
      <summary>Classroom AI 設定</summary>
      <p>
        團體課堂由教師 Profile 承接；個人練習的建立者同時是這個 Classroom 的
        Teacher／Owner。
      </p>
      <div className="sc-grid">
        <label>
          Provider Profile
          <select
            value={settings.default_profile_id || ''}
            onChange={event =>
              setSettings({
                ...settings,
                default_profile_id: event.target.value || null,
              })
            }
          >
            <option value="">沿帳號預設值</option>
            {profiles.map(profile => (
              <option value={profile.id} key={profile.id}>
                {profile.name} · {profile.adapter}
              </option>
            ))}
          </select>
        </label>
        <label>
          Fallback Profile
          <select
            value={settings.fallback_profile_id || ''}
            onChange={event =>
              setSettings({
                ...settings,
                fallback_profile_id: event.target.value || null,
              })
            }
          >
            <option value="">沿帳號 fallback／deterministic</option>
            {profiles.map(profile => (
              <option value={profile.id} key={profile.id}>
                {profile.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <ModelMatrix
        value={settings.model_matrix || {}}
        onChange={model_matrix => setSettings({ ...settings, model_matrix })}
        profiles={profiles}
        profile={profile}
      />
      <button disabled={busy} onClick={() => void save()}>
        保存並套用至 Classroom AI
      </button>
      <p role="status">{note}</p>
    </details>
  )
}
