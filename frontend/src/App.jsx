import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import Run2App from './run2/App'
import Round1App from './Round1App'

function LegacyRoutes(){ return <Round1App/> }
function Run2Routes(){ return <Run2App/> }

export default function App(){
  return <BrowserRouter>
    <Routes>
      <Route path="/round1/*" element={<LegacyRoutes/>}/>
      <Route path="/history/*" element={<LegacyRoutes/>}/>
      <Route path="/sessions/*" element={<LegacyRoutes/>}/>
      <Route path="/classrooms/:roomId" element={<Run2Routes/>}/>
      <Route path="/" element={<Run2Routes/>}/>
      <Route path="*" element={<Navigate to="/" replace/>}/>
    </Routes>
  </BrowserRouter>
}
