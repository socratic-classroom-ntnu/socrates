import { BrowserRouter } from 'react-router-dom'
import { AppRoutes } from './app/routes'
import { DevConsole } from './features/dev-console/DevConsole'
import { AuthProvider } from './features/auth/AuthContext'

// 整個前端只有這一個路由器：課程頁、分組課、示範頁與舊單人對話都掛在 src/app/routes.tsx。
// DevConsole 只在後端 debug_mode 為 true 時出現。
export default function App() {
  return <BrowserRouter>
    <AuthProvider>
      <AppRoutes />
      <DevConsole />
    </AuthProvider>
  </BrowserRouter>
}
