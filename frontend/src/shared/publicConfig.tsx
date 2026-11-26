import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { getPublicConfig } from '../contract/classroomClient'

/** 後台的功能開關（後台 spec P9）：從 /public-config 讀，重新整理頁面或 refresh() 才會更新。 */
export type Features = { group_mode: boolean; voice_mode?: boolean }
type Status = 'loading' | 'ready'
type Value = { status: Status; features: Features; refresh(): Promise<void> }

// 沒有 Provider（只在測試裡直接 render 路由時）視為多人模式開著，既有頁面測試不受影響；
// App 一律包 Provider，正式畫面讀的是伺服器的值
const OUTSIDE_PROVIDER: Value = { status: 'ready', features: { group_mode: true, voice_mode: false }, refresh: async () => undefined }
const Context = createContext<Value>(OUTSIDE_PROVIDER)
// 讀不到設定就當成關閉，跟伺服器的預設一致（後台 spec P26）
const CLOSED: Features = { group_mode: false, voice_mode: false }

export function PublicConfigProvider({ children, initial }: { children: ReactNode; initial?: Features }) {
  const [state, setState] = useState<{ status: Status; features: Features }>(
    initial ? { status: 'ready', features: initial } : { status: 'loading', features: CLOSED },
  )
  const refresh = useCallback(async () => {
    try {
      const config = await getPublicConfig()
      setState({ status: 'ready', features: {
        group_mode: config?.features?.group_mode === true,
        voice_mode: config?.features?.voice_mode === true,
      } })
    } catch {
      setState({ status: 'ready', features: CLOSED })
    }
  }, [])
  useEffect(() => { if (!initial) void refresh() }, [initial, refresh])
  const value = useMemo(() => ({ ...state, refresh }), [state, refresh])
  return <Context.Provider value={value}>{children}</Context.Provider>
}

export function useFeatures(): Value {
  return useContext(Context)
}
