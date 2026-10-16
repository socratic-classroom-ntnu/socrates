import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError, api } from '../api/classroomClient'
import { ScriptBuilder, newDocument } from '../features/script-builder/ScriptBuilder'
import { ClassroomAISettings } from '../features/ai-settings/ClassroomAISettings'

export function ClassroomLibrary({ initialSelected = '' }: { initialSelected?: string } = {}) {
  const [rows, setRows] = useState([])
  const [selected, setSelected] = useState(initialSelected)
  const [workspace, setWorkspace] = useState(null)
  const [editing, setEditing] = useState(null)
  const [title, setTitle] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [bank, setBank] = useState([])
  const pending = useRef(null)

  const refresh = useCallback(async () => {
    try {
      setRows(await api('/library/classrooms'))
      setBank(await api('/scripts'))
      if (selected) setWorkspace(await api(`/library/classrooms/${selected}`))
    } catch (error) {
      setNote(String(error))
    }
  }, [selected])

  useEffect(() => {
    void refresh()
  }, [refresh])

  async function change(path, body) {
    const key = JSON.stringify([path, body])
    if (busy) return null
    if (pending.current && pending.current.key !== key) {
      setNote('先配對前一操作回執。')
      return null
    }
    pending.current ??= { key, action_id: crypto.randomUUID() }
    setBusy(true)
    try {
      const result = await api(path, 'POST', {
        ...body,
        action_id: pending.current.action_id,
      })
      pending.current = null
      setNote('已保存。')
      await refresh()
      return result
    } catch (error) {
      if (error instanceof ApiError && error.status && error.status < 500) pending.current = null
      setNote(String(error))
      return null
    } finally {
      setBusy(false)
    }
  }

  const lessonDate = value => {
    if (!value) return '時間待同步'
    return new Intl.DateTimeFormat('zh-TW', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value * 1000))
  }

  return (
    <section className="r73-library">
      <div className="r2-section-title">
        <h2>我的教室</h2>
        <label>
          教室名稱
          <input value={title} onChange={event => setTitle(event.target.value)} />
        </label>
        <button
          disabled={busy || !title.trim()}
          onClick={() =>
            void change('/library/classrooms', { title: title.trim() }).then(result => {
              if (result) {
                setSelected(result.id)
                setTitle('')
              }
            })
          }
        >
          建立教室
        </button>
      </div>

      <div className="r2-script-grid">
        {rows.map(classroom => (
          <button
            key={classroom.id}
            className="r2-card"
            aria-pressed={selected === classroom.id}
            onClick={() => {
              setSelected(classroom.id)
              setEditing(null)
            }}
          >
            {classroom.title}
          </button>
        ))}
      </div>

      {workspace && workspace.id === selected && (
        <article className="r2-card">
          <h2>{workspace.title}</h2>
          <p>
            劇本與題庫依教室保存；每次上課保留 immutable Lesson snapshot，
            各組 Session 保存完整遊戲。
          </p>

          <ClassroomAISettings classroomId={selected} />

          <button
            disabled={busy}
            onClick={() =>
              void change(`/library/classrooms/${selected}/scripts`, {
                document: newDocument(),
              }).then(result => result && setEditing(result))
            }
          >
            新增劇本／AI 協助設計
          </button>

          <label>
            從既有題庫加入
            <select
              value=""
              onChange={event =>
                void change(`/library/classrooms/${selected}/scripts`, {
                  script_id: event.target.value,
                })
              }
            >
              <option value="" disabled>
                選取題庫劇本
              </option>
              {bank.map(script => (
                <option value={script.id} key={script.id}>
                  {script.document.title} · v{script.revision}
                </option>
              ))}
            </select>
          </label>

          <div className="r2-script-grid">
            {workspace.scripts.map(script => (
              <article key={script.id} className="r2-card">
                <h3>{script.document.title}</h3>
                <p>
                  v{script.revision} · {script.document.questions.length} 題
                </p>
                <button onClick={() => setEditing(script)}>編輯</button>
                <button
                  disabled={busy}
                  onClick={() =>
                    void change(`/library/classrooms/${selected}/batches`, {
                      script_id: script.id,
                    }).then(result => {
                      if (result) {
                        location.href = `/classrooms/${result.id}?mode=teacher`
                      }
                    })
                  }
                >
                  開課／分組
                </button>
              </article>
            ))}
          </div>

          {editing && (
            <ScriptBuilder
              key={editing.id}
              initial={editing}
              onSaved={() => void refresh()}
            />
          )}

          <h3>過去 Lesson</h3>
          <div className="r2-script-grid r88-lessons">
            {(workspace.lessons || []).map(lesson => (
              <a
                key={lesson.lesson_id}
                className="r2-card r88-lesson-card"
                href={`/classrooms/${lesson.room_id}?mode=teacher`}
              >
                <small>{lessonDate(lesson.created_at)}</small>
                <h3>{lesson.title}</h3>
                <p>
                  {lesson.lesson_kind} · v{lesson.snapshot_revision ?? '—'} ·{' '}
                  {lesson.question_count} 題
                </p>
                <p>
                  {lesson.group_count} 組 · {lesson.phase}
                </p>
                <small title={lesson.snapshot_sha256 || ''}>
                  Snapshot {lesson.snapshot_id || '同步中'}
                </small>
              </a>
            ))}
            {!(workspace.lessons || []).length && (
              <article className="r2-card">
                <h3>Lesson history ready</h3>
                <p>第一次開課後，這裡會顯示當次 immutable snapshot。</p>
              </article>
            )}
          </div>

          <h3>本教室的開課批次與完整遊戲</h3>
          <div className="r2-script-grid">
            {workspace.sessions.map(session => (
              <a
                key={session.id}
                className="r2-card"
                href={`/classrooms/${session.id}?mode=teacher`}
              >
                <strong>
                  {session.kind === 'SESSION' ? '組別 Session' : '開課批次'}
                </strong>
                <span>
                  {session.title} · {session.phase}
                </span>
                <small>{session.batch_id}</small>
              </a>
            ))}
          </div>
        </article>
      )}

      <p role="status">{note}</p>
    </section>
  )
}
