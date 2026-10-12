import ClassroomApp from './ClassroomApp'
import Round1App from './Round1App'
import QuestionBank from './pages/QuestionBank'

export default function App() {
  if (location.pathname === '/question-bank') {
    return <QuestionBank />
  }

  return /^\/(round1|history|sessions)(\/|$)/.test(location.pathname)
    ? <Round1App />
    : <ClassroomApp />
}