import Run2App from './run2/App'
import Round1App from './Round1App'

// Round1App owns its BrowserRouter; nesting a second one crashed /round1, /history and /sessions/* to a blank page.
export default function App(){ return /^\/(round1|history|sessions)(\/|$)/.test(location.pathname)?<Round1App/>:<Run2App/> }
