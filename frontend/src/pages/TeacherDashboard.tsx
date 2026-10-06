import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { ApiError, api } from '../api/classroomClient'
import type { components } from '../api/classroomTypes'
import '../styles/teacher-dashboard.css'

// 一張課程卡需要的資料。/library/classrooms 目前只給 id 與 title；
// 學生人數、主題數量、課程碼的資料來源還沒定案，拿不到時以 null 表示，卡片顯示「—」。
export type CourseCard = {
  id: string
  title: string
  studentCount: number | null
  topicCount: number | null
  code: string | null
}

// /library/* 沒有 response_model，classroomTypes.ts 裡沒有這個型別，只能照 classroom_library.py 的回傳手寫
type LibraryRow = { id: string; title: string; revision: number }
type Account = components['schemas']['AccountView']

const toCourse = (row: LibraryRow): CourseCard => ({
  id: row.id,
  title: row.title,
  studentCount: null,
  topicCount: null,
  code: null,
})

export function greeting(hour: number) {
  if (hour >= 5 && hour < 12) return '早安'
  if (hour >= 12 && hour < 18) return '午安'
  return '晚安'
}

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error))

const Icon = {
  home: (
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 11 12 4l8 7v9h-5v-6H9v6H4z" /></svg>
  ),
  shelf: (
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5v14M9 5v14M13 6l4 13" /></svg>
  ),
  gear: (
    <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3" /><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" /></svg>
  ),
  book: (
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 5h6a3 3 0 0 1 3 3v11a2 2 0 0 0-2-2H3zM21 5h-6a3 3 0 0 0-3 3v11a2 2 0 0 1 2-2h7z" /></svg>
  ),
  copy: (
    <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a1 1 0 0 1 1-1h9" /></svg>
  ),
}

type NavKey = 'home' | 'bank' | 'settings'

// 教師端共用外框：左側導覽列＋右側內容。個人題庫、設定頁由其他任務實作，先保留入口但不可點。
export function TeacherShell({ active, children }: { active: NavKey; children: ReactNode }) {
  const items: { key: NavKey; label: string; icon: ReactNode; href?: string }[] = [
    { key: 'home', label: '首頁', icon: Icon.home, href: '/teacher/home' },
    { key: 'bank', label: '個人題庫', icon: Icon.shelf },
    { key: 'settings', label: '設定', icon: Icon.gear },
  ]
  return (
    <div className="teacher-desk">
      <nav className="teacher-nav" aria-label="教師端">
        <a className="teacher-brand" href="/teacher/home">
          <i aria-hidden="true">問</i>Socrates Classroom
        </a>
        <ul>
          {items.map(item => (
            <li key={item.key}>
              {item.href ? (
                <a href={item.href} aria-current={active === item.key ? 'page' : undefined}>
                  {item.icon}
                  {item.label}
                </a>
              ) : (
                <span aria-disabled="true" title="尚未開放">
                  {item.icon}
                  {item.label}
                </span>
              )}
            </li>
          ))}
        </ul>
      </nav>
      <main className="teacher-main">{children}</main>
    </div>
  )
}

function CourseTile({ course, onCopied }: { course: CourseCard; onCopied: (text: string) => void }) {
  const stat = (value: number | null) => (value === null ? '—' : value)
  async function copy() {
    try {
      await navigator.clipboard.writeText(course.code)
      onCopied(`已複製「${course.title}」的課程碼`)
    } catch {
      onCopied('無法存取剪貼簿，請手動選取課程碼')
    }
  }
  return (
    <article className="course-tile">
      <h2>
        {Icon.book}
        {/* 整張卡可點：連結以 ::after 撐滿卡片，複製按鈕疊在上層 */}
        <a href={`/teacher/courses/${course.id}`}>{course.title}</a>
      </h2>
      <dl>
        <div>
          <dt>學生人數</dt>
          <dd>{stat(course.studentCount)}</dd>
        </div>
        <div>
          <dt>主題數量</dt>
          <dd>{stat(course.topicCount)}</dd>
        </div>
      </dl>
      <footer>
        {course.code ? (
          <>
            <code>#{course.code}</code>
            <button type="button" className="course-copy" aria-label={`複製課程碼 ${course.code}`} onClick={() => void copy()}>
              {Icon.copy}
            </button>
          </>
        ) : (
          <span className="course-nocode">尚無課程碼</span>
        )}
      </footer>
    </article>
  )
}

function CreateCourse({ onCreated, onClose }: { onCreated: () => void; onClose: () => void }) {
  const [title, setTitle] = useState('')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  // 同一次建立在重試時沿用同一個 action_id，後端才能去重，不會因網路重送建出兩門課
  const pending = useRef<{ title: string; action_id: string } | null>(null)

  async function submit() {
    const clean = title.trim()
    if (!clean || busy) return
    if (pending.current?.title !== clean) pending.current = { title: clean, action_id: crypto.randomUUID() }
    setBusy(true)
    try {
      await api('/library/classrooms', 'POST', { ...pending.current })
      pending.current = null
      onCreated()
    } catch (error) {
      if (error instanceof ApiError && error.status && error.status < 500) pending.current = null
      setNote(errorText(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="course-create" role="dialog" aria-modal="true" aria-labelledby="course-create-title">
      <form
        onSubmit={event => {
          event.preventDefault()
          void submit()
        }}
      >
        <h2 id="course-create-title">建立課程</h2>
        <label>
          課程名稱
          <input autoFocus maxLength={160} required value={title} onChange={event => setTitle(event.target.value)} />
        </label>
        <p role="status">{note}</p>
        <div className="course-create-actions">
          <button type="button" className="teacher-quiet" onClick={onClose}>
            取消
          </button>
          <button className="teacher-primary" disabled={busy || !title.trim()}>
            {busy ? '建立中…' : '建立'}
          </button>
        </div>
      </form>
    </div>
  )
}

export function TeacherDashboard({ user, now = new Date() }: { user: Pick<Account, 'username'>; now?: Date }) {
  const [courses, setCourses] = useState<CourseCard[] | null>(null)
  const [note, setNote] = useState('')
  const [creating, setCreating] = useState(false)

  const refresh = useCallback(async () => {
    try {
      const rows: LibraryRow[] = await api('/library/classrooms')
      setCourses(rows.map(toCourse))
    } catch (error) {
      setNote(errorText(error))
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return (
    <TeacherShell active="home">
      <header className="teacher-head">
        <div>
          <small>教師端</small>
          <h1>
            {greeting(now.getHours())}！{user.username}老師
          </h1>
        </div>
        <button type="button" className="teacher-primary" onClick={() => setCreating(true)}>
          <span aria-hidden="true">＋</span> 建立課程
        </button>
      </header>
      <p role="status" className="teacher-note">
        {note}
      </p>
      {courses && courses.length === 0 && <p className="teacher-empty">還沒有課程。按右上角「建立課程」開始。</p>}
      <section className="course-grid" aria-label="我的課程">
        {courses?.map(course => <CourseTile key={course.id} course={course} onCopied={setNote} />)}
      </section>
      {creating && (
        <CreateCourse
          onClose={() => setCreating(false)}
          onCreated={() => {
            setCreating(false)
            void refresh()
          }}
        />
      )}
    </TeacherShell>
  )
}
