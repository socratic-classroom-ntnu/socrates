import { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from './client'
import './provider-settings.css'

const roles = [
  ['socratic_tutor', '蘇格拉底導師'],
  ['ai_student', 'AI 學生'],
  ['dynamic_question', '動態出題'],
  ['question_summary', '單題摘要'],
  ['class_summary', '全班摘要'],
  ['personal_summary', '個人摘要'],
  ['other_suggestion', '其他 · AI 奇思妙想'],
  ['ai_script_authoring', 'AI 劇本協作'],
]

const blankProfile = {
  name: '',
  adapter: 'openrouter',
  base_url: '',
  organization: '',
  project: '',
  default_model: 'openrouter/free',
  credential_mode: 'PERSISTENT',
  credential: '',
}

function errorText(error) {
  return error instanceof Error ? error.message : String(error)
}

function ModelMatrix({ value, onChange, profiles }) {
  const [allModel, setAllModel] = useState('')
  const suggestions = useMemo(
    () => [...new Set<string>(profiles.map(profile => profile.default_model).filter(Boolean))],
    [profiles],
  )
  return (
    <section className="r97-model-matrix">
      <div className="r2-row">
        <label>
          套用至全部 AI
          <input
            list="r97-model-suggestions"
            value={allModel}
            placeholder="輸入 model ID"
            onChange={event => setAllModel(event.target.value)}
          />
        </label>
        <button
          type="button"
          disabled={!allModel.trim()}
          onClick={() =>
            onChange(Object.fromEntries(roles.map(([key]) => [key, allModel.trim()])))
          }
        >
          套用此模型到全部 AI
        </button>
      </div>
      <datalist id="r97-model-suggestions">
        {suggestions.map(model => (
          <option value={model} key={model} />
        ))}
      </datalist>
      <div className="r2-script-grid">
        {roles.map(([key, label]) => (
          <label className="r2-card" key={key}>
            {label}
            <input
              list="r97-model-suggestions"
              value={value[key] || ''}
              placeholder="沿 Provider 預設模型"
              onChange={event =>
                onChange({ ...value, [key]: event.target.value.trimStart() })
              }
            />
          </label>
        ))}
      </div>
    </section>
  )
}

export function ProviderSettings() {
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
  const [form, setForm] = useState(blankProfile)
  const [rotation, setRotation] = useState({})
  const [models, setModels] = useState({})
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(async () => {
    try {
      const [nextProfiles, nextSettings] = await Promise.all([
        api('/provider-profiles'),
        api('/ai-settings/account'),
      ])
      setProfiles(nextProfiles)
      setSettings(nextSettings)
      setNote('')
    } catch (error) {
      setNote(errorText(error))
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  async function createProfile(event) {
    event.preventDefault()
    setBusy(true)
    try {
      await api('/provider-profiles', 'POST', {
        ...form,
        base_url: form.base_url || null,
        organization: form.organization || null,
        project: form.project || null,
        credential: form.credential || null,
      })
      setForm(blankProfile)
      setNote('Provider Profile 已建立。')
      await refresh()
    } catch (error) {
      setNote(errorText(error))
    } finally {
      setBusy(false)
    }
  }

  async function rotate(profile) {
    const value = rotation[profile.id] || ''
    if (!value) return
    setBusy(true)
    try {
      await api(`/provider-profiles/${profile.id}/credential`, 'POST', {
        credential: value,
        credential_mode: profile.credential_mode,
      })
      setRotation(current => ({ ...current, [profile.id]: '' }))
      setNote('Credential 已更新。')
      await refresh()
    } catch (error) {
      setNote(errorText(error))
    } finally {
      setBusy(false)
    }
  }

  async function test(profile) {
    setBusy(true)
    try {
      const result = await api(`/provider-profiles/${profile.id}/test`, 'POST', {})
      setNote(`${profile.name} 已連線，可讀取 ${result.model_count} 個模型。`)
    } catch (error) {
      setNote(errorText(error))
    } finally {
      setBusy(false)
    }
  }

  async function discover(profile) {
    setBusy(true)
    try {
      const result = await api(`/provider-profiles/${profile.id}/models`)
      setModels(current => ({ ...current, [profile.id]: result.models || [] }))
      setNote(`${profile.name} 模型清單已更新。`)
    } catch (error) {
      setNote(errorText(error))
    } finally {
      setBusy(false)
    }
  }

  async function saveSettings() {
    setBusy(true)
    try {
      await api('/ai-settings/account', 'PUT', {
        default_profile_id: settings.default_profile_id || null,
        fallback_profile_id: settings.fallback_profile_id || null,
        model_matrix: settings.model_matrix || {},
        budgets: settings.budgets || {},
      })
      setNote('帳號 AI 預設值已保存。')
      await refresh()
    } catch (error) {
      setNote(errorText(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="r97-provider-settings">
      <header className="r2-section-title">
        <div>
          <small>ACCOUNT · LLM PROVIDERS</small>
          <h2>LLM Provider 設定</h2>
          <p>每個 Profile 的 Credential 只在設定與 Provider 呼叫期間解密。</p>
        </div>
      </header>

      <form className="r2-card r97-provider-form" onSubmit={createProfile}>
        <h3>新增 Provider Profile</h3>
        <div className="r2-grid">
          <label>
            Profile 名稱
            <input
              required
              value={form.name}
              onChange={event => setForm({ ...form, name: event.target.value })}
            />
          </label>
          <label>
            Provider
            <select
              value={form.adapter}
              onChange={event => setForm({ ...form, adapter: event.target.value })}
            >
              <option value="openrouter">OpenRouter</option>
              <option value="openai">OpenAI</option>
              <option value="anthropic">Anthropic</option>
              <option value="gemini">Google Gemini</option>
              <option value="openai-compatible">Custom OpenAI-compatible</option>
            </select>
          </label>
          <label>
            預設 model ID
            <input
              required
              value={form.default_model}
              onChange={event =>
                setForm({ ...form, default_model: event.target.value })
              }
            />
          </label>
          <label>
            Credential 保存方式
            <select
              value={form.credential_mode}
              onChange={event =>
                setForm({ ...form, credential_mode: event.target.value })
              }
            >
              <option value="PERSISTENT">加密保存</option>
              <option value="SESSION">本次登入 Session</option>
            </select>
          </label>
          <label>
            API Key
            <input
              type="password"
              autoComplete="off"
              value={form.credential}
              onChange={event =>
                setForm({ ...form, credential: event.target.value })
              }
            />
          </label>
          <label>
            Custom Base URL
            <input
              value={form.base_url}
              placeholder="https://provider.example/v1"
              onChange={event => setForm({ ...form, base_url: event.target.value })}
            />
          </label>
        </div>
        <button disabled={busy}>建立 Profile</button>
      </form>

      <div className="r2-script-grid">
        {profiles.map(profile => (
          <article className="r2-card r97-provider-card" key={profile.id}>
            <small>{profile.adapter}</small>
            <h3>{profile.name}</h3>
            <p>
              {profile.default_model} ·{' '}
              {profile.has_credential
                ? `Credential ••••${profile.secret_last4 || ''}`
                : '等待 Credential'}
            </p>
            <label>
              輪替 Credential
              <input
                type="password"
                autoComplete="off"
                value={rotation[profile.id] || ''}
                onChange={event =>
                  setRotation(current => ({
                    ...current,
                    [profile.id]: event.target.value,
                  }))
                }
              />
            </label>
            <div className="r2-row">
              <button type="button" disabled={busy} onClick={() => void rotate(profile)}>
                更新
              </button>
              <button type="button" disabled={busy} onClick={() => void test(profile)}>
                測試連線
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void discover(profile)}
              >
                讀取模型
              </button>
            </div>
            {(models[profile.id] || []).length > 0 && (
              <details>
                <summary>{models[profile.id].length} 個模型</summary>
                <ul>
                  {models[profile.id].slice(0, 50).map(model => (
                    <li key={model.id}>{model.name || model.id}</li>
                  ))}
                </ul>
              </details>
            )}
          </article>
        ))}
      </div>

      <section className="r2-card">
        <h3>帳號 AI 預設值</h3>
        <div className="r2-grid">
          <label>
            預設 Provider Profile
            <select
              value={settings.default_profile_id || ''}
              onChange={event =>
                setSettings({
                  ...settings,
                  default_profile_id: event.target.value || null,
                })
              }
            >
              <option value="">選取 Profile</option>
              {profiles.map(profile => (
                <option value={profile.id} key={profile.id}>
                  {profile.name}
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
              <option value="">使用 deterministic continuation</option>
              {profiles.map(profile => (
                <option value={profile.id} key={profile.id}>
                  {profile.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            每個 Classroom 最大 calls
            <input
              type="number"
              min={0}
              value={settings.budgets?.max_calls ?? 240}
              onChange={event =>
                setSettings({
                  ...settings,
                  budgets: {
                    ...settings.budgets,
                    max_calls: Number(event.target.value),
                  },
                })
              }
            />
          </label>
          <label>
            Token ceiling
            <input
              type="number"
              min={0}
              value={settings.budgets?.max_tokens ?? 1000000}
              onChange={event =>
                setSettings({
                  ...settings,
                  budgets: {
                    ...settings.budgets,
                    max_tokens: Number(event.target.value),
                  },
                })
              }
            />
          </label>
        </div>
        <ModelMatrix
          value={settings.model_matrix || {}}
          onChange={model_matrix => setSettings({ ...settings, model_matrix })}
          profiles={profiles}
        />
        <button disabled={busy} onClick={() => void saveSettings()}>
          保存帳號 AI 設定
        </button>
      </section>
      <p role="status">{note}</p>
    </section>
  )
}

export { ModelMatrix, roles }
