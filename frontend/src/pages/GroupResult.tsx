import React, { useState } from 'react';
import './GroupResult.css';

interface GroupMember {
  id: string;
  originalName: string;
  isMe?: boolean;
}

export const GroupResult: React.FC = () => {
  // 模擬後端傳來的分組資料
  const [groupInfo] = useState({
    groupNumber: 3,
    members: [
      { id: 'm1', originalName: '王柏睿', isMe: true }, // 使用者本人
      { id: 'm2', originalName: '李沐晴' },
      { id: 'm3', originalName: '林予安' },
      { id: 'm4', originalName: '張皓宇' },
    ] as GroupMember[]
  });

  // 處理匿名邏輯的函數
  const getMemberDisplayName = (person: GroupMember, index: number) => {
    if (person.isMe) return `${person.originalName} (你)`;
    // 其他人一律隱藏本名，顯示匿名
    return `匿名組員 ${index}`; 
  };

  return (
    <div className="group-wrapper">
      
      {/* 視覺主體：置中內容區 */}
      <div className="group-content">
        
        {/* 木框佈告欄（重複利用 WaitingRoom 的視覺風格） */}
        <div className="group-board">
          {/* 四個角落的金屬螺絲 */}
          <div className="screw top-left"></div>
          <div className="screw top-right"></div>
          <div className="screw bottom-left"></div>
          <div className="screw bottom-right"></div>

          <div className="board-title">分組完成</div>
          
          <div className="group-badge">
            第 <span>{groupInfo.groupNumber}</span> 組
          </div>

          <div className="members-grid">
            {groupInfo.members.map((person, index) => (
              <div key={person.id} className={`member-tag ${person.isMe ? 'is-me' : ''}`}>
                <span className={`thumbtack ${person.isMe ? 'thumbtack-red' : 'thumbtack-blue'}`}></span>
                {getMemberDisplayName(person, index)}
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* 底部狀態列 */}
      <div className="bottom-status-bar">
        <span className="yellow-dot"></span> 等待老師開啟小組討論...
      </div>
      
    </div>
  );
};