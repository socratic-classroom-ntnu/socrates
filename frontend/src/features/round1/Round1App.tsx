import { BrowserRouter, Route, Routes } from 'react-router-dom';
import Conversation from './Conversation';
import History from './History';
import Home from './Home';
import Summary from './Summary';
import '../../round1.css';
export default function App() {
    return (<BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />}/><Route path="/round1" element={<Home />}/>
        <Route path="/history" element={<History />}/>
        <Route path="/sessions/:sessionId" element={<Conversation />}/>
        <Route path="/sessions/:sessionId/summary" element={<Summary />}/>
      </Routes>
    </BrowserRouter>);
}
