import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from './classroomClient'

export type Resource<T> = { data: T | null; error: unknown; loading: boolean; reload(): Promise<void> }

type State<T> = { path: string | null; data: T | null; error: unknown; loading: boolean }

/**
 * GET `path` whenever it changes; `null` skips the request. Data belongs to the path it came
 * from: after the path changes the old data is never returned, not even for one render, and
 * answers for an old path (load or reload) are dropped.
 */
export function useResource<T>(path: string | null): Resource<T> {
  const [state, setState] = useState<State<T>>({ path, data: null, error: null, loading: path !== null })
  const current = useRef(path)
  current.current = path

  useEffect(() => {
    setState(previous => previous.path === path ? { ...previous, loading: path !== null } : { path, data: null, error: null, loading: path !== null })
    if (path === null) return
    let live = true
    api(path).then(
      data => { if (live) setState({ path, data: data as T, error: null, loading: false }) },
      error => { if (live) setState({ path, data: null, error, loading: false }) },
    )
    return () => { live = false }
  }, [path])

  useEffect(() => () => { current.current = null }, [])

  // After a mutation: fetch again and keep showing the current data meanwhile; a failure keeps it too.
  const reload = useCallback(async () => {
    if (path === null) return
    try {
      const data = await api(path)
      if (current.current === path) setState({ path, data: data as T, error: null, loading: false })
    } catch (error) {
      if (current.current === path) setState(previous => previous.path === path ? { ...previous, error, loading: false } : previous)
    }
  }, [path])

  const fresh = state.path === path
  return { data: fresh ? state.data : null, error: fresh ? state.error : null, loading: fresh ? state.loading : path !== null, reload }
}
