import { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from '../api/classroomClient'
import '../styles/provider-settings.css'

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

// OpenRouter Free Router：從目前可用的免費模型中自動挑一個（https://openrouter.ai/docs/guides/routing/routers/free-router）。
const FREE_ROUTER = 'openrouter/free'
const OTHER = '__other__'

function toChoices(ids: string[]) {
  return [...new Set<string>(ids.filter(Boolean))].map(id => ({
    value: id,
    label: id === FREE_ROUTER ? 'Free Router（免費）' : id,
  }))
}

function modelChoices(profiles, discovered: string[] = []) {
  return toChoices([FREE_ROUTER, ...profiles.map(profile => profile.default_model), ...discovered])
}

// openrouter/* 是 OpenRouter 自己的路由（例如 Free Router），只有 OpenRouter 連線認得。
const isOpenRouterModel = (id: string) => id === FREE_ROUTER || id.startsWith('openrouter/')

type MatrixProfile = { id?: string; adapter?: string; default_model?: string } | null | undefined

const isOpenRouter = (profile: MatrixProfile) => profile?.adapter === 'openrouter'

/** 選定連線可用的模型：OpenRouter 才列 Free Router；其他服務只列它自己的預設與讀到的模型。
 * 還沒選連線時不知道是哪個服務，沿用全部連線的清單。 */
function profileChoices(profile: MatrixProfile, profiles, discovered: string[]) {
  if (!profile) return modelChoices(profiles, discovered)
  if (isOpenRouter(profile)) return modelChoices([profile], discovered)
  return toChoices([profile.default_model || '', ...discovered]).filter(choice => !isOpenRouterModel(choice.value))
}

/** 「套用至全部 AI」一開始選哪個：OpenRouter 用 Free Router；其他服務用讀到的第一個模型，
 * 沒讀過模型就留空，讓老師自己選或輸入。 */
function bulkDefault(profile: MatrixProfile, discovered: string[]) {
  if (!profile) return ''
  if (isOpenRouter(profile)) return FREE_ROUTER
  return discovered.find(id => !isOpenRouterModel(id)) ?? ''
}

/** 新增 AI 學生時送出的模型，與上面「套用至全部 AI」同一套依服務判斷的預設：
 * 矩陣裡的 AI 學生模型適用於這個連線就沿用；否則 OpenRouter 用 Free Router，其他服務用連線自己的預設模型。
 * 沒指定連線時走伺服器預設路由（Free Router）。回傳空字串表示這個連線還沒有可用的模型，要老師先選。 */
function aiStudentModel(matrixModel: string | null | undefined, profile: MatrixProfile) {
  const chosen = (matrixModel || '').trim()
  if (!profile) return chosen || FREE_ROUTER
  if (chosen && (isOpenRouter(profile) || !isOpenRouterModel(chosen))) return chosen
  return bulkDefault(profile, [profile.default_model || ''])
}

/** 選定的連線不是 OpenRouter 時，矩陣裡仍填著 OpenRouter 模型的角色（送出去只會在上課時失敗）。 */
function mismatchedRoles(matrix: Record<string, string>, profile: MatrixProfile) {
  if (!profile || isOpenRouter(profile)) return []
  return roles.filter(([key]) => isOpenRouterModel(matrix[key] || '')).map(([, label]) => label)
}

/** 模型下拉選單：清單內的模型直接選；最後一項「其他」才展開文字框自行輸入。 */
function ModelSelect({ label, value, onChange, choices, emptyLabel = '' }) {
  const known = choices.some(choice => choice.value === value)
  const [typing, setTyping] = useState(Boolean(value) && !known)
  const custom = typing || (Boolean(value) && !known) || choices.length === 0
  const selected = custom ? OTHER : value || ''
  return (
    <span className="r97-model-select">
      <select
        aria-label={label}
        value={selected}
        onChange={event => {
          const next = event.target.value
          if (next === OTHER) {
            setTyping(true)
            onChange(known ? '' : value)
          } else {
            setTyping(false)
            onChange(next)
          }
        }}
      >
        {emptyLabel && <option value="">{emptyLabel}</option>}
        {!emptyLabel && !value && !custom && <option value="" disabled>選擇模型</option>}
        {choices.map(choice => (
          <option value={choice.value} key={choice.value} title={choice.value}>
            {choice.label}
          </option>
        ))}
        <option value={OTHER}>其他（自行輸入）</option>
      </select>
      {custom && (
        <input
          maxLength={200}
          aria-label={`${label}（自行輸入）`}
          autoFocus={typing}
          value={value || ''}
          placeholder="輸入模型代碼，例如 provider/model-name"
          onChange={event => onChange(event.target.value.trimStart())}
        />
      )}
    </span>
  )
}

function ModelMatrix({
  value,
  onChange,
  profiles,
  models = [],
  profile = null,
}: {
  value: Record<string, string>
  onChange: (matrix: Record<string, string>) => void
  profiles
  models?: string[]
  profile?: MatrixProfile
}) {
  const choices = useMemo(() => profileChoices(profile, profiles, models), [profile, profiles, models])
  // 老師自己挑的模型只對當時那個連線有效；換了連線（或服務種類）就回到該連線的預設。
  const profileKey = profile ? `${profile.id ?? ''}:${profile.adapter}` : ''
  const [picked, setPicked] = useState<{ key: string; model: string } | null>(null)
  const allModel = picked && picked.key === profileKey ? picked.model : bulkDefault(profile, models)
  const model = allModel.trim()
  const wrongService = Boolean(profile) && !isOpenRouter(profile) && isOpenRouterModel(model)
  const mismatched = mismatchedRoles(value, profile)
  return (
    <section className="r97-model-matrix">
      <div className="r2-row">
        <label>
          套用至全部 AI
          <ModelSelect
            key={profileKey}
            label="套用至全部 AI"
            value={allModel}
            onChange={next => setPicked({ key: profileKey, model: next })}
            choices={choices}
          />
        </label>
        <button
          type="button"
          disabled={!model || wrongService}
          onClick={() => onChange(Object.fromEntries(roles.map(([key]) => [key, model])))}
        >
          套用此模型到全部 AI
        </button>
      </div>
      {wrongService && <p role="alert">這組連線不是 OpenRouter，不能使用 {model}。請改選這個服務的模型。</p>}
      {mismatched.length > 0 && (
        <p role="alert">這組連線不是 OpenRouter，下列角色仍設定為 OpenRouter 模型，請改選：{mismatched.join('、')}</p>
      )}
      <div className="r2-script-grid">
        {roles.map(([key, label]) => (
          <label className="r2-card" key={key}>
            {label}
            <ModelSelect
              label={label}
              value={value[key] || ''}
              onChange={next => onChange({ ...value, [key]: next })}
              choices={choices}
              emptyLabel="沿連線的預設模型"
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
    if (!form.default_model.trim()) {
      setNote('請選擇或輸入預設模型。')
      return
    }
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
      setNote('AI 連線已建立。')
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
      setNote('金鑰已更新。')
      await refresh()
    } catch (error) {
      setNote(errorText(error))
    } finally {
      setBusy(false)
    }
  }

  // 測試連線／讀取模型的結果顯示在該連線卡片裡（手機上頁尾的狀態列看不到）。
  const [checks, setChecks] = useState<Record<string, { state: string; text: string }>>({})
  const check = (id: string, state: string, text: string) =>
    setChecks(current => ({ ...current, [id]: { state, text } }))

  async function test(profile) {
    setBusy(true)
    check(profile.id, 'busy', '測試中…')
    try {
      const result = await api(`/provider-profiles/${profile.id}/test`, 'POST', {})
      check(profile.id, 'ok', `連線成功：金鑰有效，可使用 ${result.model_count} 個模型。`)
    } catch (error) {
      check(profile.id, 'error', `連線失敗：${errorText(error)}`)
    } finally {
      setBusy(false)
    }
  }

  async function discover(profile) {
    setBusy(true)
    check(profile.id, 'busy', '讀取模型中…')
    try {
      const result = await api(`/provider-profiles/${profile.id}/models`)
      setModels(current => ({ ...current, [profile.id]: result.models || [] }))
      check(profile.id, 'ok', `已讀取 ${(result.models || []).length} 個模型，可在下方 AI 預設值選用。`)
    } catch (error) {
      check(profile.id, 'error', `讀取失敗：${errorText(error)}`)
    } finally {
      setBusy(false)
    }
  }

  const defaultProfile = profiles.find(profile => profile.id === settings.default_profile_id) || null
  const matrixModels = useMemo(() => {
    const listed = defaultProfile ? models[defaultProfile.id] || [] : Object.values(models).flat()
    return (listed as { id: string }[]).slice(0, 50).map(model => model.id)
  }, [defaultProfile, models])

  async function saveSettings() {
    const mismatched = mismatchedRoles(settings.model_matrix || {}, defaultProfile)
    if (mismatched.length) {
      setNote(`預設連線不是 OpenRouter，請先替這些角色改選模型：${mismatched.join('、')}`)
      return
    }
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
          <small>帳號設定 · AI 服務</small>
          <h2>連接 AI 服務</h2>
          <p>先建立一組連線、測試，再選為帳號預設。金鑰以加密或本次登入模式保存。</p>
        </div>
      </header>

      <form className="r2-card r97-provider-form" onSubmit={createProfile}>
        <h3>新增 AI 服務連線</h3>
        <div className="r2-grid">
          <label>
            連線名稱
            <input
              maxLength={100}
              required
              value={form.name}
              onChange={event => setForm({ ...form, name: event.target.value })}
            />
          </label>
          <label>
            Provider
            <select
              value={form.adapter}
              onChange={event => {
                const adapter = event.target.value
                // OpenRouter 的預設是 Free Router；其他服務沒有共通的免費路由，改由使用者輸入模型代碼。
                const default_model = adapter === 'openrouter'
                  ? (form.default_model && form.default_model !== FREE_ROUTER ? form.default_model : FREE_ROUTER)
                  : (form.default_model === FREE_ROUTER ? '' : form.default_model)
                setForm({ ...form, adapter, default_model })
              }}
            >
              <option value="openrouter">OpenRouter</option>
              <option value="openai">OpenAI</option>
              <option value="anthropic">Anthropic</option>
              <option value="gemini">Google Gemini</option>
              <option value="openai-compatible">Custom OpenAI-compatible</option>
            </select>
          </label>
          <label>
            預設模型
            <ModelSelect
              label="預設模型"
              value={form.default_model}
              onChange={default_model => setForm({ ...form, default_model })}
              choices={form.adapter === 'openrouter' ? modelChoices([]) : []}
            />
          </label>
          <label>
            金鑰保存方式
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
            API 金鑰
            <input
              maxLength={20000}
              type="password"
              autoComplete="off"
              value={form.credential}
              onChange={event =>
                setForm({ ...form, credential: event.target.value })
              }
            />
          </label>
          <label>
            自訂服務網址（使用 OpenRouter 時留空）
            <input
              maxLength={500}
              value={form.base_url}
              placeholder="https://provider.example/v1"
              onChange={event => setForm({ ...form, base_url: event.target.value })}
            />
          </label>
        </div>
        <button disabled={busy}>建立連線</button>
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
                : '等待設定金鑰'}
            </p>
            <label>
              更新金鑰
              <input
                maxLength={20000}
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
            {checks[profile.id] && (
              <p className={`connection-check is-${checks[profile.id].state}`} role="status" aria-live="polite">
                {checks[profile.id].text}
              </p>
            )}
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
            預設 AI 連線
            <select
              value={settings.default_profile_id || ''}
              onChange={event =>
                setSettings({
                  ...settings,
                  default_profile_id: event.target.value || null,
                })
              }
            >
              <option value="">選擇已建立的連線</option>
              {profiles.map(profile => (
                <option value={profile.id} key={profile.id}>
                  {profile.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            備援 AI 連線
            <select
              value={settings.fallback_profile_id || ''}
              onChange={event =>
                setSettings({
                  ...settings,
                  fallback_profile_id: event.target.value || null,
                })
              }
            >
              <option value="">使用課堂既有備用回應</option>
              {profiles.map(profile => (
                <option value={profile.id} key={profile.id}>
                  {profile.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            每堂課的呼叫次數上限
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
            文字處理量上限（Token）
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
          profile={defaultProfile}
          models={matrixModels}
        />
        <button disabled={busy} onClick={() => void saveSettings()}>
          保存帳號 AI 設定
        </button>
      </section>
      <p role="status">{note}</p>
    </section>
  )
}

export { ModelMatrix, ModelSelect, FREE_ROUTER, roles, mismatchedRoles, aiStudentModel }
