import Run2App from './run2/App'
import Round1App from './Round1App'
export default function App(){return /^\/(round1|history|sessions)(\/|$)/.test(location.pathname)?<Round1App/>:<Run2App/>}
