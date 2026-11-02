import { Outlet } from 'react-router-dom';
import '../../round1.css';
// 舊單人對話的頁面掛在 app/routes.tsx 的單一路由器底下；這裡只負責載入它自己的樣式。
export default function LegacySoloDialogueLayout() {
    return <Outlet />;
}
