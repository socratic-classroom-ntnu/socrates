import { BrowserRouter, Route, Routes } from 'react-router-dom';
import Conversation from './pages/Conversation';
import Home from './pages/Home';
import Summary from './pages/Summary';
import { WaitingRoom } from './pages/WaitingRoom';
// 1. 引入剛寫好的投票結果頁面
import { PollResult } from './pages/PollResult';
import { GroupResult } from './pages/GroupResult';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/waiting-room" element={<WaitingRoom />} />
        
        {/* 2. 幫新頁面註冊專屬網址 */}
        <Route path="/poll-result" element={<PollResult />} />
        
        <Route path="/sessions/:sessionId" element={<Conversation />} />
        <Route path="/sessions/:sessionId/summary" element={<Summary />} />
        <Route path="/group-result" element={<GroupResult />} />
      </Routes>
    </BrowserRouter>
  );
}
