import { useEffect, useState } from 'react'
import './Danmaku.css'

const STAGE_WIDTH = 1280
const STAGE_HEIGHT = 800

function getStageScale() {
  const horizontalScale = window.innerWidth / STAGE_WIDTH
  const verticalScale = window.innerHeight / STAGE_HEIGHT

  return Math.min(horizontalScale, verticalScale, 1)
}

export default function Danmaku() {
  const [scale, setScale] = useState(getStageScale)
  const [activeTab, setActiveTab] = useState<'stage' | 'mine'>('stage')
  const [draft, setDraft] = useState('')

  const [sentDanmaku, setSentDanmaku] = useState<
    { id: number; text: string; time: string }[]
  >([])

  useEffect(() => {
    function handleResize() {
      setScale(getStageScale())
    }

    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
    }
  }, [])

  function handleSendDanmaku() {
    const text = draft.trim()

    if (!text) {
      return
    }

    setSentDanmaku((current) => [
      ...current,
      {
        id: Date.now(),
        text,
        time: '01:12',
      },
    ])

    setDraft('')
  }
  return (
    <main className="danmaku-page">
      <div
        className="danmaku-stage-shell"
        style={{
          width: STAGE_WIDTH * scale,
          height: STAGE_HEIGHT * scale,
        }}
      >
        <div
          className="danmaku-stage"
          style={{
            transform: `scale(${scale})`,
          }}
        >
          <iframe
            className="stage-art-frame"
            src="/danmaku-stage.html"
            title="舞台背景"
            aria-hidden="true"
            tabIndex={-1}
          />
        
          <header className="live-header">
          <div className="live-logo">問</div>

          <ol className="live-participants">
              <li className="participant participant-selected">
              <span className="participant-letter participant-letter-a">A</span>
              <span className="participant-selected-name">王柏睿</span>
              </li>

              <li className="participant">
              <span className="participant-letter participant-letter-b">B</span>
              林予安
              </li>

              <li className="participant">
              <span className="participant-letter participant-letter-c">C</span>
              黃以涵
              </li>

              <li className="participant">
              <span className="participant-letter participant-letter-d">D</span>
              李沐晴
              </li>
          </ol>

          <div className="live-status">
              <span className="live-indicator">
              <span className="live-dot" />
              LIVE 01:12
              </span>

              <span className="viewer-count">32 人</span>
          </div>
          </header>

          <div className="live-question">
          如果說謊能讓一個人免於痛苦，說謊是對的嗎？
          </div>
          <aside className="record-panel">
            <div className="record-tabs" role="tablist" aria-label="紀錄切換">
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'stage'}
                className={`record-tab ${activeTab === 'stage' ? 'record-tab-active' : ''}`}
                onClick={() => setActiveTab('stage')}
              >
                台上 · 王柏睿
              </button>

              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'mine'}
                className={`record-tab ${activeTab === 'mine' ? 'record-tab-active' : ''}`}
                onClick={() => setActiveTab('mine')}
              >
                我的紀錄
              </button>
            </div>

            {activeTab === 'stage' ? (
              <>
                <div className="record-answer">
                  <span className="record-label">王柏睿 作答時寫下</span>
                  <span className="record-answer-text">
                    病人本來就很痛苦，真相只會讓他更痛，結果比較重要。
                  </span>
                </div>

                <ol className="record-timeline">
                  <li>
                    <span className="record-time">00:08</span>
                    <span>我選 A，因為道德應該看它帶來什麼。</span>
                  </li>

                  <li>
                    <span className="record-time">00:31</span>
                    <span>如果誠實讓人更痛苦，那堅持誠實是為了誰？</span>
                  </li>

                  <li>
                    <span className="record-time">00:57</span>
                    <span>回應彈幕：誰來判斷結果？我覺得是當事人最親近的人。</span>
                  </li>
                </ol>
              </>
            ) : (
              <div className="my-record">
                <div className="my-answer">
                  <span className="my-answer-title">
                    <span className="my-answer-letter">B</span>
                    第 1 題 · 我的回答
                  </span>

                  <span className="record-answer-text">
                    如果對方是重病的家人，善意的謊言可以保護他；但如果是朋友問我意見，
                    說謊反而讓他失去判斷的機會。
                  </span>
                </div>

                <span className="record-label">這一輪我發的彈幕</span>

                <ol className="record-timeline my-danmaku-list">
                  <li>
                    <span className="record-time">00:34</span>
                    <span>可是結果誰說了算？</span>
                  </li>

                  <li>
                    <span className="record-time">00:52</span>
                    <span>短期不痛，長期呢？</span>
                  </li>

                  {sentDanmaku.map((item) => (
                    <li key={item.id}>
                      <span className="record-time">{item.time}</span>
                      <span>{item.text}</span>
                    </li>
                  ))}
                </ol>

                <span className="record-label">送出的禮物</span>

                <span className="gift-record">好點子 ×1 → 王柏睿</span>
              </div>
            )}
          </aside>
          <div className="socrates-bubble">
            <span className="socrates-name">蘇格拉底</span>
            柏睿，你說結果比原則重要。那麼，由誰來衡量結果？
          </div>

          <div className="danmaku danmaku-1">
            可是結果誰說了算？
          </div>

          <div className="danmaku danmaku-2">
            那醫生該不該對病人說謊
          </div>

          <div className="danmaku danmaku-3 danmaku-highlight">
            短期不痛，長期呢？
          </div>

          <div className="danmaku danmaku-4">
            如果被發現是謊言會更痛吧
          </div>
          {sentDanmaku.map((item, index) => (
            <div
              key={item.id}
              className="danmaku sent-danmaku"
              style={{
                left: `${420 + (index % 3) * 120}px`,
                top: `${510 - (index % 3) * 55}px`,
              }}
            >
              {item.text}
            </div>
          ))}          
          <footer className="danmaku-footer">
            <label htmlFor="danmaku-input" className="sr-only">
              發送彈幕
            </label>

            <input
              id="danmaku-input"
              className="danmaku-input"
              placeholder="發送彈幕，向台上的人追問…"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  handleSendDanmaku()
                }
              }}
            />

            <button
              type="button"
              className="send-button"
              onClick={handleSendDanmaku}
            >
              發送
            </button>

            <button
              type="button"
              className="gift-button"
              aria-label="送禮物"
            >
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="3" y="8" width="18" height="4" rx="1" />
                <path d="M12 8v13M19 12v9H5v-9M7.5 8a2.5 2.5 0 0 1 0-5C11 3 12 8 12 8s1-5 4.5-5a2.5 2.5 0 0 1 0 5" />
              </svg>
            </button>

            <button type="button" className="next-button">
              下一題
            </button>
          </footer>
        </div>
      </div>
    </main>
  )
}