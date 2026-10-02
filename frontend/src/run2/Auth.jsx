import { useEffect, useState } from 'react';
import { api, setCSRF } from './client';
import './auth.css';

const COPY = {
    login: { title: '歡迎回來', subtitle: '登入後入座', submit: '推門進入' },
    register: { title: '新生報到', subtitle: '第一次來', submit: '完成報到' },
    forgot: { title: '重設密碼', subtitle: '補發鑰匙', submit: '寄送重設信' },
    reset: { title: '設定新密碼', subtitle: '換一把新鑰匙', submit: '更新密碼' },
};

// 後端多數錯誤已是中文句子；這裡只翻譯仍是代碼或沒有 detail 的情況，其餘原樣顯示。
export function authErrorText(e) {
    if (e?.detail === 'ORIGIN_BINDING_REQUIRED')
        return '目前的網址未被伺服器允許，請改用正確的網址開啟。';
    if (e?.status === 422)
        return '資料格式不符：使用者名稱 3–64 字（英數字與 . _ -），Email 需有效，密碼至少 12 字。';
    if (e?.status === 0)
        return '連不上伺服器，請確認網路後再試一次。';
    if (e?.status >= 500)
        return '伺服器暫時出了問題，請稍後再試。';
    return e instanceof Error ? e.message : String(e);
}

export function Auth({ onLogin }) {
    const [mode, setMode] = useState('login');
    const [name, setName] = useState(''), [email, setEmail] = useState(''), [password, setPassword] = useState('');
    const [note, setNote] = useState(''), [failed, setFailed] = useState(false), [busy, setBusy] = useState(false);
    const query = new URLSearchParams(location.search);
    const say = (text, isError = false) => { setNote(text); setFailed(isError); };
    useEffect(() => {
        const token = new URLSearchParams(location.search).get('verify_token');
        if (token)
            void api('/auth/verify', 'POST', { token }).then(() => { say('Email 已驗證，請登入。'); history.replaceState({}, '', '/'); }).catch(e => say(authErrorText(e), true));
        if (new URLSearchParams(location.search).has('reset_token'))
            setMode('reset');
    }, []);
    async function submit() {
        setBusy(true);
        try {
            if (mode === 'login') {
                const a = await api('/auth/login', 'POST', { login: name, password });
                setCSRF(a.csrf_token);
                onLogin(a);
            }
            if (mode === 'register') {
                const account = await api('/auth/register', 'POST', {
                    username: name,
                    email,
                    password
                });
                setCSRF(account.csrf_token);
                onLogin(account);
            }
            if (mode === 'forgot') {
                await api('/auth/forgot-password', 'POST', { email });
                say('重設郵件已排入寄送；請查看信箱。');
            }
            if (mode === 'reset') {
                await api('/auth/reset-password', 'POST', { token: query.get('reset_token'), password });
                history.replaceState({}, '', '/');
                setMode('login');
                say('密碼已更新，請重新登入。');
            }
        }
        catch (e) {
            say(authErrorText(e), true);
        }
        finally {
            setBusy(false);
        }
    }
    const go = (next) => { setMode(next); say(''); };
    const copy = COPY[mode];
    return <main className="r2-door">
      <div className="r2-door-brand"><i>問</i>蘇格拉底課堂</div>
      <div className="r2-door-leaf" aria-hidden="true"><span className="glass"/><span className="panel upper"/><span className="panel lower"/><span className="handle"/></div>
      <div className="r2-door-stage">
        <form className="r2-door-sign" onSubmit={e => { e.preventDefault(); void submit(); }}>
          <span className="screw tl"/><span className="screw tr"/><span className="screw bl"/><span className="screw br"/>
          <header className="r2-door-plate"><h1>［{copy.title}］</h1><small>{copy.subtitle}</small></header>
          <dl className="r2-door-meta"><dt>主持</dt><dd>蘇格拉底</dd></dl>
          {(mode === 'login' || mode === 'register') && <label>{mode === 'login' ? '使用者名稱或 Email' : <>使用者名稱 <span className="hint">· 3–64 字，英數字與 . _ -</span></>}<input autoComplete="username" required value={name} onChange={e => setName(e.target.value)}/></label>}
          {(mode === 'register' || mode === 'forgot') && <label>Email {mode === 'register' ? <span className="hint">· 用來驗證帳號、找回密碼</span> : <span className="hint">· 我們會寄一封重設信給你</span>}<input type="email" required value={email} onChange={e => setEmail(e.target.value)}/></label>}
          {mode !== 'forgot' && <label>{mode === 'reset' ? '新密碼' : '密碼'}{mode !== 'login' && <> <span className="hint">· 至少 12 個字</span></>}<input type="password" minLength={mode === 'login' ? 1 : 12} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required value={password} onChange={e => setPassword(e.target.value)}/></label>}
          <p role="status" className={'r2-door-note' + (failed ? ' error' : '')}>{note}</p>
          <button className="r2-door-primary" disabled={busy}>{busy ? '處理中…' : copy.submit + ' →'}</button>
          <nav className="r2-door-links" aria-label="切換登入方式">
            {mode === 'login' ? <><button type="button" onClick={() => go('register')}>註冊新帳號</button><button type="button" onClick={() => go('forgot')}>忘記密碼</button></>
            : <button type="button" onClick={() => go('login')}>{mode === 'register' ? '已有帳號，回到登入' : '回到登入'}</button>}
          </nav>
        </form>
      </div>
    </main>;
}
