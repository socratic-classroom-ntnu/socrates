import React, { useState, useEffect } from 'react';
import './PollResult.css';
import bgImage from './bg-classroom.png'; 

export const PollResult: React.FC = () => {
  const pollData = [
    { id: 'A', text: '結果比原則重要', count: 7, percent: 22, color: '#e57373' }, 
    { id: 'B', text: '要看對象是誰', count: 14, percent: 44, color: '#64b5f6' }, 
    { id: 'C', text: '誠實是底線', count: 8, percent: 25, color: '#ffd54f' }, 
    { id: 'D', text: '我還無法判斷', count: 3, percent: 9, color: '#81c784' }, 
  ];

  const [showBars, setShowBars] = useState(false);

  useEffect(() => {
    setTimeout(() => setShowBars(true), 100);
  }, []);

  return (
    <div className="poll-wrapper">
      <div className="classroom-bg" style={{ backgroundImage: `url(${bgImage})` }}>
        
        <div className="top-status">
          <span className="badge">問</span> Q1 / 5 · 32 人作答
        </div>

        {/* 🌟 剛剛就是不小心刪到了這層外套，導致定位全毀 */}
        <div className="blackboard-overlay">
          <h2 className="question-title">說謊能讓人免於痛苦，是對的嗎？</h2>
          
          <div className="options-container">
            {pollData.map((option) => (
              <div className="poll-row" key={option.id}>
                
                {/* 文字與字母吃同一個顏色 */}
                <div className="poll-label" style={{ color: option.color }}>
                  <span className="opt-id">{option.id}</span>
                  {option.text}
                </div>
                
                {/* 進度條與數字緊緊相連的區塊 */}
                <div className="poll-progress-area">
                  <div 
                    className="poll-bar-fill"
                    style={{ 
                      '--theme-color': option.color,
                      width: showBars ? `${option.percent}%` : '0%' 
                    } as React.CSSProperties}
                  ></div>
                  
                  <div className="poll-stats">
                    {option.count} 人 · {option.percent}%
                  </div>
                </div>
                
              </div>
            ))}
          </div>
        </div>

        <div className="bottom-panels">
          <div className="panel blue-panel">
            <span className="label">你的選擇 · B</span>
            <h3>不一定，要看對象是誰</h3>
          </div>
          
          <div className="panel yellow-note">
            <p>和你一樣的有 14 人，<br/>是全班最多的選擇。</p>
          </div>
          
          <div className="panel black-panel">
            <span className="label">下一步</span>
            <h3>轉動蘇格拉底輪盤 <span className="arrow">→</span></h3>
            <p>每個選項各抽一人起立獨秀</p>
          </div>
        </div>

      </div>
    </div>
  );
};