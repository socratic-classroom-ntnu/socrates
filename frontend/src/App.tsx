import { BrowserRouter } from 'react-router-dom'
import { AppRoutes } from './app/routes'
import { ROUTER_FUTURE } from './app/routerFuture'
import { DevConsole } from './features/dev-console/DevConsole'
import { AuthProvider } from './features/auth/AuthContext'
import { FeedbackLayer } from './features/feedback/FeedbackLayer'
import { PublicConfigProvider } from './shared/publicConfig'

// 整個前端只有這一個路由器：課程頁、分組課與示範頁都掛在 src/app/routes.tsx。
// DevConsole 只在後端 debug_mode 為 true 時出現。
// 意見回饋按鈕掛在路由旁邊而不是 AppShell 裡：登入前的頁面也要有（意見回饋 spec P13）。
export default function App() {
  return <BrowserRouter future={ROUTER_FUTURE}>
    <AuthProvider>
      <PublicConfigProvider>
        <AppRoutes />
        <FeedbackLayer />
      </PublicConfigProvider>
      <DevConsole />
    </AuthProvider>
  </BrowserRouter>
}
