import type { ModelOption } from '../../contract/classroomClient'
import { useT } from '../../i18n/useT'
import { Select } from '../../ui'
import styles from './AIConnection.module.css'

export type ModelList = { state: 'idle' } | { state: 'loading' } | { state: 'ready'; models: ModelOption[] } | { state: 'failed'; message: string }

/**
 * 模型選單：共用的 Select 加搜尋框，打的字也能直接當模型代碼用；免費模型標「免費・可能限流」。
 * 照後台 ModelPicker 的做法另寫一份（ai-settings 不能用 admin 模組）；不預選、不標「推薦」。
 */
export function ConnectionModelPicker({ id, value, list, service, disabled, invalid, describedBy, onChange }: {
  id: string
  value: string
  list: ModelList
  /** Shown as the provider line for services whose list has none; empty before a service is picked. */
  service: string
  disabled: boolean
  invalid: boolean
  describedBy?: string
  onChange: (modelId: string) => void
}) {
  const { t } = useT('teach')
  const models = list.state === 'ready' ? list.models : []
  return <Select
    id={id}
    value={value}
    listLabel={t('aiSettings.model')}
    placeholder={t(service ? 'aiSettings.pickModel' : 'aiSettings.pickServiceFirst')}
    disabled={disabled}
    invalid={invalid}
    describedBy={describedBy}
    align="end"
    search={{ label: t('aiSettings.searchModels'), placeholder: `${t('aiSettings.searchModels')}…` }}
    typedLabel={text => t('aiSettings.useTyped', { id: text })}
    options={models.map(model => ({
      value: model.id,
      label: model.name,
      description: model.provider ?? service,
      badge: model.free ? <span className={styles.free}>{t('aiSettings.free')}</span> : undefined,
    }))}
    note={({ query, matches }) => {
      if (list.state === 'loading') return t('aiSettings.loadingModels')
      if (list.state === 'failed') return t('aiSettings.noModelList', { reason: list.message })
      if (list.state === 'ready') return query ? t('aiSettings.matchCount', { count: matches }) : t('aiSettings.modelCount', { count: models.length })
      return null
    }}
    onChange={onChange}
  />
}
