import { BrowserRouter, Route, Routes } from 'react-router-dom'
import Conversation from './pages/Conversation'
import Home from './pages/Home'
import Summary from './pages/Summary'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/sessions/:sessionId" element={<Conversation />} />
        <Route path="/sessions/:sessionId/summary" element={<Summary />} />
      </Routes>
    </BrowserRouter>
  )
}
