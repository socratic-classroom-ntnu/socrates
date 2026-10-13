import { ModelSelect } from '../../pages/ProviderSettings'
import '../../styles/script-builder.css'

const FREE_ROUTER = 'openrouter/free'

/** 這個連線可選的模型：連線預設模型、已讀取過的模型清單；OpenRouter 另有 Free Router。 */
export function profileModelChoices(profile) {
  if (!profile) return []
  const cached = (profile.metadata?.model_cache?.models || []).slice(0, 50).map(model => model.id)
  const ids = [
    ...(profile.adapter === 'openrouter' ? [FREE_ROUTER] : []),
    profile.default_model,
    ...cached,
  ]
  return [...new Set<string>(ids.filter(Boolean))].map(id => ({
    value: id,
    label: id === FREE_ROUTER ? 'Free Router（免費）' : id,
  }))
}

/**
 * 單題的 AI 模型（scenario_ai）：預設「沿用課堂設定」＝不覆寫；選了連線後再選模型。
 * profiles 為 null 表示還沒讀取；打開選單時呼叫 onNeedProfiles 再讀，避免每次開編輯器都多打一次 API。
 */
export function ScenarioModelSelect({ index, value, onChange, profiles, onNeedProfiles, note = '' }) {
  const label = `情境 ${index + 1} 的 AI 連線`
  const profileId = value?.provider_profile_id || ''
  const list = profiles || []
  const profile = list.find(p => p.id === profileId)
  const known = Boolean(profile) || !profileId
  return <div className="scenario-model">
    <label>本題 AI 模型<select
      aria-label={label}
      value={profileId}
      onFocus={onNeedProfiles}
      onMouseDown={onNeedProfiles}
      onChange={e => {
        const next = list.find(p => p.id === e.target.value)
        onChange(next ? { provider_profile_id: next.id, model: next.default_model || '' } : undefined)
      }}
    >
      <option value="">沿用課堂設定</option>
      {!known && <option value={profileId}>{profiles ? '已不存在的連線（請重新選擇）' : '已指定的連線'}</option>}
      {list.map(p => <option key={p.id} value={p.id}>{p.name}（{p.adapter}）</option>)}
    </select></label>
    {profileId && <label>本題模型<ModelSelect
      // 連線清單讀到後重新掛載，讓已存的模型對上選項，而不是停在「自行輸入」。
      key={`${profileId}:${profile ? 'loaded' : 'pending'}`}
      label={`情境 ${index + 1} 的模型`}
      value={value?.model || ''}
      choices={profileModelChoices(profile)}
      onChange={model => onChange({ provider_profile_id: profileId, model })}
    /></label>}
    {profiles && profiles.length === 0 && <small>還沒有 AI 連線；可到帳號 AI 設定新增後再回來指定。</small>}
    {note && <small>{note}</small>}
  </div>
}
