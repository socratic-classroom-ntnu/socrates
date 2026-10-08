import '../styles/entrance.css';

const ENTRIES = [
    { href: '/student', title: '學生', line: '輸入老師給的課程代碼，進教室入座。', action: '我是學生' },
    { href: '/teacher', title: '老師', line: '開課、出題，查看課堂的思考分佈。', action: '我是老師' },
];

// 登入前的身份選擇。只決定走哪個入口，不影響帳號權限（見 role.js）。
export function RoleSelect() {
    return <main className="entrance entrance--roles">
      <div className="entrance-brand"><i>問</i>蘇格拉底課堂</div>
      <div className="entrance-roles">
        <h1 className="entrance-roles-heading">今天，你從哪扇門進來？</h1>
        <div className="entrance-roles-grid">
          {ENTRIES.map(entry => <a key={entry.href} className="entrance-sign entrance-roles-card" href={entry.href}>
            <span className="screw tl"/><span className="screw tr"/><span className="screw bl"/><span className="screw br"/>
            <span className="entrance-plate"><strong>［{entry.title}］</strong></span>
            <span className="entrance-roles-line">{entry.line}</span>
            <span className="entrance-primary">{entry.action} →</span>
          </a>)}
        </div>
      </div>
    </main>;
}
