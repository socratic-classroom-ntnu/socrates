// 明確表態 React Router v7 的兩個行為，v6 才不會每次印 Future Flag 警告。
// relativeSplatPath 先採用：唯一的 splat route 是 404 頁，連結是絕對路徑，行為不變。
// startTransition 先不採用：開了之後登出時 account 清空會比 navigate('/login') 先 render，
// RequireAuth 搶先導去 /login?next=<原頁>（routes.test、GuestFlows.test 會抓到）。升 v7 前要先處理登出順序。
// 測試裡的 MemoryRouter／BrowserRouter 由 setupTests.ts 預設套用同一組設定。
export const ROUTER_FUTURE = { v7_startTransition: false, v7_relativeSplatPath: true } as const
