import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from './app/AuthContext'
import { AppRoutes } from './app/routes'
import { DevConsole } from './features/dev-console/DevConsole'

// 整個前端只有這一個路由器：舊頁、Round 1 與新頁都掛在 src/app/routes.tsx。
// DevConsole 只在後端 debug_mode 為 true 時出現。
export default function App() {
  return <BrowserRouter>
    <AuthProvider>
      <AppRoutes />
      <DevConsole />
    </AuthProvider>
  </BrowserRouter>
}
