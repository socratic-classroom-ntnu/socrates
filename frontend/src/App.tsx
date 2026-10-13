import ClassroomApp from './ClassroomApp'
import Round1App from './features/round1/Round1App'
import { isRound1Path } from './features/round1/routes'
import { DevConsole } from './features/dev-console/DevConsole'

// Round1App owns its BrowserRouter; nesting a second one crashed /round1, /history and /sessions/* to a blank page.
// DevConsole 只在後端 debug_mode 為 true 時出現（兩個 app 都適用）。
export default function App(){ return <>{isRound1Path(location.pathname)?<Round1App/>:<ClassroomApp/>}<DevConsole/></> }
