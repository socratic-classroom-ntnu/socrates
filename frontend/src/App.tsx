
import ClassroomApp from './ClassroomApp'
import Round1App from './Round1App'
import QuestionBank from './pages/QuestionBank'
import Danmaku from './pages/Danmaku'

export default function App() {
  if (location.pathname === '/question-bank') {
    return <QuestionBank />
  }

  if (location.pathname === '/danmaku') {
    return <Danmaku />
  }

  return /^\/(round1|history|sessions)(\/|$)/.test(location.pathname)
    ? <Round1App />
    : <ClassroomApp />
}
