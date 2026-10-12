import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError, api } from '../api/classroomClient'
import { phaseLabel } from '../shared/phaseLabels'
import { ScriptBuilder } from '../features/script-builder/ScriptBuilder'
import { ClassroomAISettings } from '../features/ai-settings/ClassroomAISettings'
import { PublishQuestions } from '../features/question-bank/PublishQuestions'

export function ClassroomLibrary({ initialSelected = '', bankOnly = false }: { initialSelected?: string; bankOnly?: boolean } = {}) {
  const [selected, setSelected] = useState(initialSelected)
  const [rows, setRows] = useState([])
  const [workspace, setWorkspace] = useState(null)
  const [bank, setBank] = useState([])
  const [editing, setEditing] = useState(null)
  const [dirty, setDirty] = useState(false)
  const [tab, setTab] = useState('questions')
  const [choice, setChoice] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const pending = useRef(null)
  const request = useRef(0)
  const lock = useRef(false)
  const refresh = useCallback(async () => {
    const revision = ++request.current
    setLoading(true)
    try {
      const [courses, scripts, current] = await Promise.all([
        bankOnly ? Promise.resolve([]) : api('/library/classrooms'),
        api('/scripts'), selected ? api(`/library/classrooms/${selected}`) : Promise.resolve(null),
      ])
      if (revision !== request.current) return
      setRows(courses); setBank(scripts); setWorkspace(current); setNote('')
      setChoice(value => current?.scripts?.some(script => script.id === value) ? value : (current?.scripts?.[0]?.id || ''))
    } catch (error) {
      if (revision === request.current) setNote(error instanceof Error ? error.message : String(error))
    } finally { if (revision === request.current) setLoading(false) }
  }, [selected, bankOnly])
  useEffect(() => { void refresh(); return () => { request.current++ } }, [refresh])
  async function change(path, body) {
    if (lock.current) return null
    const key = JSON.stringify([path, body])
    if (pending.current && pending.current.key !== key) { setNote('請重試上一個操作，確認儲存結果後再繼續。'); return null }
    pending.current ??= { key, action_id: crypto.randomUUID() }
    lock.current = true; setBusy(true); setNote('')
    try {
      const result = await api(path, 'POST', { ...body, action_id: pending.current.action_id })
      pending.current = null
      await refresh()
      return result
    } catch (error) {
      if (error instanceof ApiError && error.status && error.status < 500) pending.current = null
      setNote(error instanceof Error ? error.message : String(error)); return null
    } finally { lock.current = false; setBusy(false) }
  }
  function closeEditor() {
    if (dirty && !window.confirm('保留目前編輯請按取消；按確定返回題目清單。')) return
    setEditing(null); setDirty(false)
  }
  async function saved(script) {
    if (selected && script?.id && !workspace?.scripts?.some(row => row.id === script.id)) {
      const result = await change(`/library/classrooms/${selected}/scripts`, { script_id: script.id })
      if (!result) { setNote('題目已存入個人題庫。請用「從題庫加入」將它加入本課程。'); return }
    } else await refresh()
    setNote('題目已儲存。返回清單即可選擇題目開課。')
  }
  const date = value => value ? new Intl.DateTimeFormat('zh-TW', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value * 1000)) : '時間同步中'
  const scripts = bankOnly ? bank : (workspace?.scripts || [])
  return <section className="r73-library">
    {!bankOnly && selected && <nav className="r2-row" aria-label="麵包屑"><a href="/teacher/home">我的課程</a><span aria-hidden="true">／</span><span aria-current="page">{workspace?.title || '課程內容'}</span></nav>}
    <header className="r2-section-title">
      <div><small>{bankOnly ? '題目管理' : '教師工作室'}</small><h1>{bankOnly ? '個人題庫' : (workspace?.title || '我的課程')}</h1><p>{bankOnly ? '建立可重用的題目，再加入不同課程。' : '準備題目、邀請學生，開始一堂討論課。'}</p></div>
      {!editing && <button className="teacher-primary" onClick={() => { setEditing({}); setNote('') }} disabled={!bankOnly && !selected}>＋ 新增題目</button>}
    </header>
    {note && <p role="status" className="teacher-note">{note}</p>}
    {loading && !workspace && !bank.length && <p role="status">正在讀取課程資料…</p>}
    {!loading && !bankOnly && selected && !workspace && <div className="r2-card"><h2>重新讀取課程</h2><p>請確認網路與課程權限，再重試。</p><button onClick={() => void refresh()}>重試</button><a href="/teacher/home">返回我的課程</a></div>}
    {!selected && !bankOnly && <div className="r2-script-grid">{rows.map(row => <button key={row.id} className="r2-card" onClick={() => setSelected(row.id)}>{row.title}</button>)}</div>}
    {editing ? <><div className="r2-row"><button className="teacher-quiet" onClick={closeEditor}>← 返回題目清單</button><span>{dirty ? '編輯中・記得儲存' : '目前內容已保存'}</span></div><ScriptBuilder key={editing.id || 'new'} initial={editing.id ? editing : null} onSaved={saved} onDirtyChange={setDirty}/></> : (bankOnly || workspace) && <>
      {!bankOnly && <nav className="r2-tabs" aria-label="課程內容">{[['questions','課堂題目'],['history','上課紀錄'],['settings','AI 設定']].map(([key,label]) => <button key={key} aria-pressed={tab === key} onClick={() => setTab(key)}>{label}</button>)}</nav>}
      {(bankOnly || tab === 'questions') && <>
        {!bankOnly && <section className="r2-glass r73-start"><div><small>開始一堂課</small><h2>{scripts.length ? '選好題目，就可以開課' : '先準備第一份題目'}</h2><p>開課後取得加入代碼，再安排學生分組。每次開課都會保存當時的題目版本。</p></div><div><label>本次使用的題目<select aria-label="本次使用的題目" value={choice} disabled={busy || !scripts.length} onChange={event => setChoice(event.target.value)}><option value="" disabled>選擇題目</option>{scripts.map(script => <option key={script.id} value={script.id}>{script.document.title}（{script.document.questions.length} 題）</option>)}</select></label><button className="teacher-primary" disabled={busy || !choice} onClick={() => void change(`/library/classrooms/${selected}/batches`, { script_id: choice }).then(result => { if (result) location.href = `/classrooms/${result.id}?mode=teacher` })}>{busy ? '準備課堂中…' : '開課 →'}</button>{!scripts.length && <small>按「新增題目」，或從個人題庫加入。</small>}</div></section>}
        <div className="r2-section-title"><h2>{bankOnly ? '我的題目' : '課堂題目'} <small>{scripts.length} 份</small></h2>{!bankOnly && <label>從題庫加入<select aria-label="從題庫加入" value="" disabled={busy} onChange={event => void change(`/library/classrooms/${selected}/scripts`, { script_id: event.target.value }).then(result => result && setNote('已加入課程。'))}><option value="" disabled>選擇個人題庫中的題目</option>{bank.filter(script => !scripts.some(row => row.id === script.id)).map(script => <option key={script.id} value={script.id}>{script.document.title}</option>)}</select></label>}</div>
        {!scripts.length && !loading && <section className="r2-card"><h3>從一個好問題開始</h3><p>新增一份題目，寫下情境、選項與引導目標；儲存後即可開課。</p><button className="teacher-primary" onClick={() => setEditing({})}>新增第一份題目</button></section>}
        <div className="r2-script-grid">{scripts.map(script => <article key={script.id} className="r2-card"><small>{script.document.mode === 'dynamic' ? 'AI 動態出題' : '預先準備的題目'}</small><h3>{script.document.title}</h3><p>{script.document.questions.length} 題 · 版本 {script.revision}</p><div className="r2-row"><button className="teacher-quiet" onClick={() => { setEditing(script); setNote('') }}>編輯題目</button>{!bankOnly && <button className="teacher-quiet" aria-pressed={choice === script.id} onClick={() => setChoice(script.id)}>{choice === script.id ? '已選為本次題目' : '選為本次題目'}</button>}</div><PublishQuestions script={script} onNote={setNote}/></article>)}</div>
        <p><a href="/teacher/home?view=store">到題庫商店找其他老師分享的題目 →</a></p>
      </>}
      {!bankOnly && tab === 'history' && <><h2>過去的課</h2><p>查看當次題目、分組與討論進度。</p>{!(workspace.lessons || []).length && <section className="r2-card"><h3>第一堂課，從這裡開始</h3><p>開課後，這裡會留下題目版本與課堂紀錄。</p><button onClick={() => setTab('questions')}>回到題目並開課</button></section>}<div className="r2-script-grid">{(workspace.lessons || []).map(lesson => <a key={lesson.lesson_id} className="r2-card" href={`/classrooms/${lesson.room_id}?mode=teacher`}><small>{date(lesson.created_at)}</small><h3>{lesson.title}</h3><p>{lesson.question_count} 題 · {lesson.group_count} 組 · {phaseLabel(lesson.phase)}</p><span>查看這堂課 →</span></a>)}</div>{(workspace.sessions || []).length > 0 && <details><summary>查看各組進度</summary><div className="r2-script-grid">{workspace.sessions.map(session => <a key={session.id} className="r2-card" href={`/classrooms/${session.id}?mode=teacher`}><h3>{session.title}</h3><p>{session.kind === 'SESSION' ? '組別討論' : '整班課堂'} · {phaseLabel(session.phase)}</p></a>)}</div></details>}</>}
      {!bankOnly && tab === 'settings' && <section className="r2-card"><h2>本課程的 AI 設定</h2><p>一般課堂可沿用帳號預設模型。需要調整時，再展開進階設定。</p><a href="/teacher/home?view=settings">前往帳號 AI 連線設定 →</a><details><summary>進階設定：模型與使用額度</summary><ClassroomAISettings classroomId={selected}/></details></section>}
    </>}
  </section>
}
