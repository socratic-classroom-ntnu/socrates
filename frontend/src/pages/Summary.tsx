import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { createSummary, getSummary } from '../api/client'
import type { components } from '../api/types'
import './Summary.css'
type SummaryView = components['schemas']['SummaryView']

const STATUS_LABELS: Record<string, string> = {
  goal_met: '想清楚了',
  capped: '還沒有定見',
  stopped_early: '中途結束',
  skipped: '沒有走到',
  not_started: '沒有走到',
  in_progress: '進行中',
}

type OptionData = {
  key: string
  label: string
  count: number
}

type QuestionDetail = {
  index: number
  options: OptionData[]
  personalAnalysis: string
  groupSummary: string
}

const PREVIEW_DETAILS: QuestionDetail[] = [
  {
    index: 0,
    options: [
      { key: 'A', label: '結果比原則重要', count: 7 },
      { key: 'B', label: '要看對象是誰', count: 14 },
      { key: 'C', label: '誠實是底線', count: 8 },
      { key: 'D', label: '我還無法判斷', count: 3 },
    ],
    personalAnalysis:
      '你選了 B，理由是「要看對象」。你同時考慮了結果與對方的自主權。下一步可以繼續思考：當兩者衝突時，你會優先選擇哪一個？',
    groupSummary:
      '全班近半選擇 B。討論從單純判斷說謊的對錯，逐漸轉向誰有資格替他人做決定。',
  },
  {
    index: 1,
    options: [
      { key: 'A', label: '應該說實話', count: 9 },
      { key: 'B', label: '視情況決定', count: 13 },
      { key: 'C', label: '保護他人優先', count: 6 },
      { key: 'D', label: '我還無法判斷', count: 4 },
    ],
    personalAnalysis:
      '你開始注意到，善意本身不一定足以決定行為是否正確，也需要考慮可能造成的結果。',
    groupSummary:
      '多數同學認為不能只用單一原則判斷，需要同時考慮動機、關係與結果。',
  },
  {
    index: 2,
    options: [
      { key: 'A', label: '有時候可以', count: 10 },
      { key: 'B', label: '應由本人決定', count: 12 },
      { key: 'C', label: '依關係決定', count: 7 },
      { key: 'D', label: '我還無法判斷', count: 3 },
    ],
    personalAnalysis:
      '你的思考開始從結果轉向自主權，並注意到替別人做決定本身也可能產生問題。',
    groupSummary:
      '這一題的主要討論集中在自主權與保護他人之間的衝突。',
  },
  {
    index: 3,
    options: [
      { key: 'A', label: '仍然應該說', count: 11 },
      { key: 'B', label: '不一定', count: 12 },
      { key: 'C', label: '不要說', count: 5 },
      { key: 'D', label: '我還無法判斷', count: 4 },
    ],
    personalAnalysis:
      '你開始把長期關係納入判斷，而不只是考慮當下可能產生的痛苦。',
    groupSummary:
      '班上的主要分歧在於，長期信任是否應該比短期傷害更優先。',
  },
  {
    index: 4,
    options: [
      { key: 'A', label: '當事人自己', count: 15 },
      { key: 'B', label: '親近的人', count: 6 },
      { key: 'C', label: '依情況判斷', count: 8 },
      { key: 'D', label: '我還無法判斷', count: 3 },
    ],
    personalAnalysis:
      '你的思考已經從是否說謊，逐漸轉向誰具有做出判斷的正當性。',
    groupSummary:
      '最後的討論焦點從說謊本身，轉向誰有權替他人判斷與做決定。',
  },
]

export default function Summary() {
  const { sessionId = '' } = useParams()
  const [summary, setSummary] = useState<SummaryView | null>(null)
  const [failed, setFailed] = useState(false)
  const [openQuestion, setOpenQuestion] = useState<number | null>(null)

  async function generate() {
    setFailed(false)

    try {
      setSummary(await createSummary(sessionId))
    } catch {
      setFailed(true)
    }
  }

  useEffect(() => {
  getSummary(sessionId)
    .then(setSummary)
    .catch(() => {
      void generate()
    })
}, [sessionId])

  const selectedOutcome = summary?.stage_outcomes.find(
    (outcome) => outcome.index === openQuestion
  )

  const selectedDetail = PREVIEW_DETAILS.find(
    (detail) => detail.index === openQuestion
  )

  if (failed) {
    return (
      <main className="summary-status-page">
        <div className="summary-status-box">
          <h2>整理失敗</h2>
          <p>載入討論總結時發生錯誤，請稍後再試。</p>

          <button className="summary-retry-button" onClick={generate}>
            重新整理
          </button>
        </div>
      </main>
    )
  }

  if (!summary) {
    return (
      <main className="summary-status-page">
        <div className="summary-status-box">
          <div className="summary-loading-spinner"></div>
          <h2>教授正在整理你剛剛說的…</h2>
          <p>請稍候，我們正在產生這次的討論總結。</p>
        </div>
      </main>
    )
  }

  return (
    <div className="summary-page">
      <main className="summary-blackboard">
        <header className="summary-header">
          <div>
            <h1>今日課堂總結</h1>
            <div className="summary-title-line"></div>
          </div>

          <p className="summary-course-info">
            共 {summary.stage_outcomes.length} 個討論情境
          </p>
        </header>

        <section className="summary-main">
          <h2>LLM 總結 ——</h2>
          <p>{summary.core_principle}</p>
        </section>

        <section className="summary-stages">
          <h2>你走過的情境（點開看分析）</h2>

          <div className="summary-stage-grid">
            {summary.stage_outcomes.map((outcome) => (
              <button
                type="button"
                className="summary-stage-card"
                key={outcome.index}
                onClick={() => setOpenQuestion(outcome.index)}
              >
                <div className="summary-stage-top">
                  <span className="summary-stage-number">
                    Q{outcome.index + 1}
                  </span>

                  <span
                    className={`summary-stage-status status-${outcome.status}`}
                  >
                    {STATUS_LABELS[outcome.status]}
                  </span>
                </div>

                <p>{outcome.title ?? `情境 ${outcome.index + 1}`}</p>
              </button>
            ))}
          </div>
        </section>
      </main>

      <div className="summary-chalk-tray">
        <span className="summary-chalk summary-chalk-white"></span>
        <span className="summary-chalk summary-chalk-yellow"></span>
        <span className="summary-chalk summary-chalk-pink"></span>
      </div>

      {selectedOutcome && selectedDetail && (
        <div className="summary-modal-overlay">
          <div
            className="summary-question-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="summary-question-title"
          >
            <div className="summary-modal-header">
              <div>
                <span className="summary-modal-number">
                  Q{selectedOutcome.index + 1} / {summary.stage_outcomes.length}
                </span>

                <h2 id="summary-question-title">
                  {selectedOutcome.title ??
                    `情境 ${selectedOutcome.index + 1}`}
                </h2>
              </div>

              <button
                type="button"
                className="summary-close-button"
                onClick={() => setOpenQuestion(null)}
                aria-label="關閉"
              >
                ×
              </button>
            </div>

            <section className="summary-statistics-box">
              <h3>統計圖表</h3>

              {selectedDetail.options.map((option) => {
                const maxCount = Math.max(
                  ...selectedDetail.options.map((item) => item.count)
                )

                const width = (option.count / maxCount) * 100

                return (
                  <div className="summary-option-row" key={option.key}>
                    <span
                      className={`summary-option-label summary-option-${option.key.toLowerCase()}`}
                    >
                      {option.key} {option.label}
                    </span>

                    <div className="summary-option-bar-container">
                      <div
                        className={`summary-option-bar summary-option-bar-${option.key.toLowerCase()}`}
                        style={{ width: `${width}%` }}
                      ></div>
                    </div>

                    <span className="summary-option-count">
                      {option.count} 人
                    </span>
                  </div>
                )
              })}
            </section>

            <section className="summary-analysis-grid">
              <div className="summary-analysis-card summary-personal-analysis">
                <h3>LLM 對你的分析</h3>
                <p>{selectedDetail.personalAnalysis}</p>
              </div>

              <div className="summary-analysis-card summary-group-analysis">
                <h3>LLM 對大家的總結</h3>
                <p>{selectedDetail.groupSummary}</p>
              </div>
            </section>
          </div>
        </div>
      )}
    </div>
  )
}
