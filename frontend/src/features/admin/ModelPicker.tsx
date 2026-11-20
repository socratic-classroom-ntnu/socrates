import type { ModelOption } from '../../contract/classroomClient'
import { useT } from '../../i18n/useT'
import { Select } from '../../ui'
import styles from './Admin.module.css'

export type ModelList = { state: 'idle' } | { state: 'loading' } | { state: 'ready'; models: ModelOption[] } | { state: 'failed'; message: string }

/**
 * 系統 AI 的模型選單（後台 spec P40）：共用的 Select 加上搜尋框；搜尋框打的字也能直接用。
 * 這裡只決定清單長什麼樣：名稱、供應商（沒有就寫服務名稱）、免費模型的標籤、清單上方那一行。
 */
export function ModelPicker({ id, value, list, service, disabled, invalid, describedBy, onChange }: {
  id: string
  value: string
  list: ModelList
  /** Shown as the provider line for services whose list has none. */
  service: string
  disabled: boolean
  invalid: boolean
  describedBy?: string
  onChange: (modelId: string) => void
}) {
  const { t } = useT('admin')
  const models = list.state === 'ready' ? list.models : []
  return <Select
    id={id}
    value={value}
    listLabel={t('systemAI.model')}
    placeholder={t('systemAI.pickModel')}
    disabled={disabled}
    invalid={invalid}
    describedBy={describedBy}
    align="end"
    search={{ label: t('systemAI.searchModels'), placeholder: `${t('systemAI.searchModels')}…` }}
    typedLabel={text => t('systemAI.useTyped', { id: text })}
    options={models.map(model => ({
      value: model.id,
      label: model.name,
      description: model.provider ?? service,
      badge: model.free ? <span className={styles.pickerFree}>{t('systemAI.free')}</span> : undefined,
    }))}
    note={({ query, matches }) => {
      if (list.state === 'loading') return t('systemAI.loadingModels')
      if (list.state === 'failed') return t('systemAI.noModelList', { reason: list.message })
      if (list.state === 'ready') return query ? t('systemAI.matchCount', { count: matches }) : t('systemAI.modelCount', { count: models.length })
      return null
    }}
    onChange={onChange}
  />
}
