import ClassroomApp from './ClassroomApp';
import Round1App from './features/round1/Round1App';
import { isRound1Path } from './features/round1/routes';
import { DevConsole } from './features/dev-console/DevConsole';

// Round1App owns its BrowserRouter; classroom and demo routes share ClassroomApp's auth boundary.
export default function App() {
  const page = isRound1Path(location.pathname) ? <Round1App/> : <ClassroomApp/>;
  return <>{page}<DevConsole/></>;
}
