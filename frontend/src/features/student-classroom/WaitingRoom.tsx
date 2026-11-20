import React, { useState } from 'react';
import './WaitingRoom.css';

interface Participant {
  id: string;
  name: string;
  isMe?: boolean;
}

export const WaitingRoom: React.FC = () => {
  const [participants, setParticipants] = useState<Participant[]>([
    { id: '2', name: '王柏睿' },
    { id: '3', name: '李沐晴' },
    { id: '4', name: '林予安' },
    { id: '5', name: '張皓宇' },
  ]);

  const [inputValue, setInputValue] = useState('');
  const [isJoined, setIsJoined] = useState(false);

  const handleJoinClass = () => {
    if (!inputValue.trim()) return;
    const newStudent: Participant = {
      id: Date.now().toString(),
      name: inputValue,
      isMe: true,
    };
    setParticipants([newStudent, ...participants]);
    setIsJoined(true); 
  };

  const getDisplayName = (person: Participant, index: number) => {
    if (person.isMe) return `${person.name} (你)`;
    return `匿名學員 ${index + 1}`; 
  };

  return (
    <div className="classroom-wrapper">
      <div className="classroom-content">
        
        {/* 左側：課程資訊卡 */}
        <div className="info-panel">
          {/* ⭐ 新增：四個角落的金屬螺絲釘 */}
          <div className="screw top-left"></div>
          <div className="screw top-right"></div>
          <div className="screw bottom-left"></div>
          <div className="screw bottom-right"></div>

          <div className="info-inner-black-box">
            <h2>[教室編號]</h2>
          </div>
          <div className="info-details">
            <p><span>課程</span> [課程名稱]</p>
            <p><span>代碼</span> K 7 Q 2 X M</p>
            <p><span>主持</span> 蘇格拉底</p>
          </div>
          <div className="status-badge">
            <span className="red-dot"></span> 上課中
          </div>
        </div>

        {/* 中間：簽到佈告欄 */}
        <div className="sign-in-board">
          <div className="board-header">
            <h3>今日簽到</h3>
            <span>{participants.length} 人已到</span>
          </div>
          <div className="participant-grid">
            {participants.map((person, index) => (
              <div key={person.id} className={`name-tag ${person.isMe ? 'is-me' : ''}`}>
                {/* ⭐ 更改：從扁平的 dot 變成擬真的 thumbtack (圖釘) */}
                <span className={`thumbtack ${person.isMe ? 'thumbtack-red' : 'thumbtack-blue'}`}></span>
                {getDisplayName(person, index)}
              </div>
            ))}
          </div>
        </div>

        {/* 右側：3D 教室門 */}
        <div className="door-panel">
          <div className="door-leaf">
            <div className="door-window"></div>
          </div>
        </div>

      </div>

      {isJoined ? (
        <div className="bottom-status-bar">
          <span className="yellow-dot"></span> 等待老師開始第一題...
        </div>
      ) : (
        <div className="bottom-input-bar">
          <input
            type="text"
            placeholder="請輸入你的姓名加入課堂..."
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleJoinClass()}
          />
          <button onClick={handleJoinClass} disabled={!inputValue.trim()}>
            簽到進入
          </button>
        </div>
      )}
    </div>
  );
};