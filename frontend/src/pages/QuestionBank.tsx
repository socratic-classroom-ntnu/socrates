import { useState } from 'react'
import './QuestionBank.css'

type Question = {
  id: number
  title: string
  description: string
  status: 'active' | 'ended'
  endDate?: string
}

const questions: Question[] = [
  {
    id: 1,
    title: '電車難題',
    description: '題目詳細說明……',
    status: 'active',
  },
  {
    id: 2,
    title: '電車難題',
    description: '題目詳細說明……',
    status: 'ended',
    endDate: 'YYYY/MM/DD',
  },
]

export default function QuestionBank() {
  const [questionItems, setQuestionItems] = useState(questions)
  const [openMenuId, setOpenMenuId] = useState<number | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Question | null>(null)
  return (
    <main className="question-bank-page">
      <aside className="teacher-sidebar">
        <button type="button" className="sidebar-menu" aria-label="選單">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>

        <nav className="sidebar-nav" aria-label="教師功能">
          <button
            type="button"
            className="sidebar-button sidebar-button-active"
            aria-label="首頁"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M3 11.5 12 4l9 7.5" />
              <path d="M5.5 10.5V20h13v-9.5" />
            </svg>
          </button>

          <button
            type="button"
            className="sidebar-button"
            aria-label="題庫"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <rect x="5" y="4" width="14" height="16" rx="2" />
              <path d="M8 8h8M8 12h8M8 16h5" />
            </svg>
          </button>

          <button
            type="button"
            className="sidebar-button"
            aria-label="成員"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="9" cy="8" r="3" />
              <path d="M3.5 19c.6-3.2 2.4-5 5.5-5s4.9 1.8 5.5 5" />
              <circle cx="17" cy="9" r="2.2" />
              <path d="M15.5 14.5c2.8-.2 4.5 1.2 5 3.5" />
            </svg>
          </button>

          <button
            type="button"
            className="sidebar-button"
            aria-label="設定"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="12" r="3" />
              <path d="M19 12a7 7 0 0 0-.1-1l2-1.5-2-3.4-2.4 1a7 7 0 0 0-1.7-1L14.5 3h-5l-.3 3.1a7 7 0 0 0-1.7 1l-2.4-1-2 3.4 2 1.5a7 7 0 0 0 0 2l-2 1.5 2 3.4 2.4-1a7 7 0 0 0 1.7 1l.3 3.1h5l.3-3.1a7 7 0 0 0 1.7-1l2.4 1 2-3.4-2-1.5a7 7 0 0 0 .1-1Z" />
            </svg>
          </button>
        </nav>
      </aside>      
      <section className="question-bank-main">
      <div className="question-bank-header">
          <div>
          <p className="course-label">課程</p>
          <h1 className="course-title">科技系統與社會發展 A</h1>

          <div className="course-code-row">
              <span className="course-code-label">課程代碼</span>
              <span className="course-code">ABC123</span>
          </div>
          </div>
      </div>

      <div className="question-bank-section-heading">
          <h2>過去的題目</h2>

          <button type="button" className="add-activity-button">
          ＋ 新增活動
          </button>
      </div>
      <div className="question-list-panel">
          {questionItems.map((question) => (
            <article className="question-card" key={question.id}>
              <div className="question-card-menu">
                <button
                  type="button"
                  className="question-menu-button"
                  aria-label={`${question.title} 操作選單`}
                  aria-expanded={openMenuId === question.id}
                  onClick={() =>
                    setOpenMenuId((current) =>
                      current === question.id ? null : question.id,
                    )
                  }
                >
                  ⋮
                </button>

                {openMenuId === question.id && (
                  <div className="question-menu-dropdown">
                    <button
                      type="button"
                      onClick={() => setOpenMenuId(null)}
                    >
                      加入個人題庫
                    </button>

                    <button
                      type="button"
                      onClick={() => setOpenMenuId(null)}
                    >
                      編輯
                    </button>

                    <button
                      type="button"
                      className="question-menu-delete"
                      onClick={() => {
                        setDeleteTarget(question)
                        setOpenMenuId(null)
                      }}
                    >
                      刪除
                    </button>
                  </div>
                )}
              </div>
              <div className="question-card-header">
                <h3>{question.title}</h3>

                <span
                  className={`question-status ${
                    question.status === 'active'
                      ? 'question-status-active'
                      : 'question-status-ended'
                  }`}
                >
                  {question.status === 'active' ? '進行中' : '已結束'}
                </span>

                {question.status === 'ended' && question.endDate && (
                  <span className="question-end-date">
                    結束日期：{question.endDate}
                  </span>
                )}
              </div>

              <div className="question-card-divider" />

              <div className="question-description">
                {question.description}
              </div>
            </article>
          ))}        
      </div>      
      </section>
      {deleteTarget && (
        <div className="delete-modal-backdrop">
          <div
            className="delete-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-modal-title"
          >
            <h2 id="delete-modal-title">刪除題目</h2>

            <p>
              確定要刪除「{deleteTarget.title}」嗎？
            </p>

            <div className="delete-modal-actions">
              <button
                type="button"
                className="delete-modal-cancel"
                onClick={() => setDeleteTarget(null)}
              >
                取消
              </button>

              <button
                type="button"
                className="delete-modal-confirm"
                onClick={() => {
                  setQuestionItems((current) =>
                    current.filter(
                      (question) => question.id !== deleteTarget.id,
                    ),
                  )
                  setDeleteTarget(null)
                }}
              >
                確認刪除
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}