<<<<<<< HEAD
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import Conversation from './pages/Conversation'
import Danmaku from './pages/Danmaku'
import Home from './pages/Home'
import Summary from './pages/Summary'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/sessions/:sessionId" element={<Conversation />} />
        <Route path="/sessions/:sessionId/summary" element={<Summary />} />

        <Route path="/danmaku" element={<Danmaku />} />
      </Routes>
    </BrowserRouter>
  )
}
=======
import ClassroomApp from './ClassroomApp'
import Round1App from './Round1App'

// Round1App owns its BrowserRouter; nesting a second one crashed /round1, /history and /sessions/* to a blank page.
export default function App(){ return /^\/(round1|history|sessions)(\/|$)/.test(location.pathname)?<Round1App/>:<ClassroomApp/> }
>>>>>>> origin/develop
