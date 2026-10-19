import { Outlet } from 'react-router-dom';
import './round1.css';
// Round 1 的頁面掛在 src/app/routes.tsx 的單一路由器底下；這裡只負責載入 Round 1 自己的樣式。
export default function Round1Layout() {
    return <Outlet />;
}
