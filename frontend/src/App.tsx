import ClassroomApp from './ClassroomApp'
import Round1App from './Round1App'
import { isRound1Path } from './round1Routes'

// Round1App owns its BrowserRouter; nesting a second one crashed /round1, /history and /sessions/* to a blank page.
export default function App(){ return isRound1Path(location.pathname)?<Round1App/>:<ClassroomApp/> }
