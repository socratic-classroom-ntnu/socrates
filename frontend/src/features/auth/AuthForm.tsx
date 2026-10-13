import { useEffect, useRef, useState } from 'react';
import { ApiError, api, setCSRF } from '../../api/classroomClient';
import { PASSWORD_RULE, fieldErrors, fieldText, errorMessage } from '../../api/errorText';
// 與後端 Register 一致（backend/app/api/classroom_schemas.py）：送出前先在前端擋下，錯誤說明對應到欄位。
export const REGISTER_LIMITS = { username: [3, 32], email: [3, 254], password: [8, 32] } as const;
// 與後端 USERNAME_PATTERN 一致：英文字母開頭、英文字母或數字結尾，中間可用英數、底線、點、連字號。
const USERNAME_RE = /^[A-Za-z][A-Za-z0-9_.-]*[A-Za-z0-9]$/;
// 後端只要求 @ 後面有點；這裡同樣要求網域有點（123@g 會被擋下），也不允許空白。
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// 與後端 PASSWORD_SPECIALS 一致；密碼需大寫、小寫、數字與其中一個特殊字元，不能有其他符號。
// 登入不檢查格式：舊規則（12–256 字）設定的密碼要能照常輸入。
const LOGIN_PASSWORD_MAX = 256;
export const PASSWORD_SPECIALS = '!@#$%^&*_-+=.?~';
/** 設定新密碼時只讓允許的字元進輸入框；回傳留下的字與被擋下的字（去重、以空白分隔）。 */
export function keepPasswordChars(value: string) {
    const ok = (c: string) => /[A-Za-z0-9]/.test(c) || PASSWORD_SPECIALS.includes(c);
    const list = Array.from(value);
    const kept = list.filter(ok).slice(0, REGISTER_LIMITS.password[1]).join('');
    const blocked = [...new Set(list.filter(c => !ok(c)).map(c => (c === ' ' ? '空白' : c)))].join(' ');
    return { kept, blocked };
}
export function passwordOk(value: string) {
    const special = (c: string) => PASSWORD_SPECIALS.includes(c);
    const list = Array.from(value);
    return list.every(c => /[A-Za-z0-9]/.test(c) || special(c))
        && /[A-Z]/.test(value) && /[a-z]/.test(value) && /[0-9]/.test(value) && list.some(special);
}
const chars = (value: string) => Array.from(value).length;
/** 註冊欄位的前端預檢；訊息與後端 422 轉成的中文相同。 */
export function registerProblems({ username, email, password }: { username: string; email: string; password: string }) {
    const problems: { field: string; text: string }[] = [];
    const length = (field: 'username' | 'email' | 'password', value: string) => {
        const [min, max] = REGISTER_LIMITS[field];
        if (!value) return fieldText(field, 'missing');
        if (chars(value) < min) return fieldText(field, 'string_too_short', { min_length: min });
        if (chars(value) > max) return fieldText(field, 'string_too_long', { max_length: max });
        return '';
    };
    const user = length('username', username) || (USERNAME_RE.test(username) ? '' : fieldText('username', 'string_pattern_mismatch'));
    if (user) problems.push({ field: 'username', text: user });
    const mail = length('email', email) || (EMAIL_RE.test(email) ? '' : fieldText('email', 'value_error'));
    if (mail) problems.push({ field: 'email', text: mail });
    const secret = length('password', password) || (passwordOk(password) ? '' : fieldText('password', 'password_policy'));
    if (secret) problems.push({ field: 'password', text: secret });
    return problems;
}
// 註冊時已被使用的欄位：錯誤顯示在該欄位下方。ACCOUNT_PENDING_VERIFICATION 可能是任一欄位，顯示在表單說明。
const TAKEN_FIELD: Record<string, string> = { USERNAME_TAKEN: 'username', EMAIL_TAKEN: 'email' };
export function Auth({ onLogin }) {
    const [mode, setMode] = useState('login');
    const [name, setName] = useState(''), [email, setEmail] = useState(''), [password, setPassword] = useState('');
    const [blocked, setBlocked] = useState('');
    const [note, setNote] = useState(''), [busy, setBusy] = useState(false);
    const [fieldError, setFieldError] = useState<Record<string, string>>({});
    const usernameInput = useRef<HTMLInputElement>(null), emailInput = useRef<HTMLInputElement>(null), passwordInput = useRef<HTMLInputElement>(null);
    const inputs = { username: usernameInput, email: emailInput, password: passwordInput };
    const showFieldErrors = (list: { field: string; text: string }[]) => {
        setFieldError(Object.fromEntries(list.map(f => [f.field, f.text])));
        setNote('');
        inputs[list[0].field]?.current?.focus();
    };
    const clearField = (field: string) => setFieldError(current => {
        if (!current[field]) return current;
        const next = { ...current };
        delete next[field];
        return next;
    });
    const switchMode = next => { setMode(next); setFieldError({}); setBlocked(''); };
    const fieldProps = (field: string, hint?: string) => mode === 'register' && fieldError[field]
        ? { 'aria-invalid': true, 'aria-describedby': [hint, `register-${field}-error`].filter(Boolean).join(' ') }
        : hint ? { 'aria-describedby': hint } : {};
    const fieldMessage = (field: string) => mode === 'register' && fieldError[field]
        ? <small id={`register-${field}-error`} role="alert">{fieldError[field]}</small>
        : null;
    const query = new URLSearchParams(location.search);
    useEffect(() => {
        const token = new URLSearchParams(location.search).get('verify_token');
        if (token)
            void api('/auth/verify', 'POST', { token }).then(() => { setNote('Email 已驗證，請登入。'); history.replaceState({}, '', '/'); }).catch(e => setNote(errorMessage(e)));
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
                const problems = registerProblems({ username: name, email: email.trim(), password });
                if (problems.length) {
                    showFieldErrors(problems);
                    return;
                }
                setFieldError({});
                const account = await api('/auth/register', 'POST', {
                    username: name,
                    email: email.trim(),
                    password
                });
                setCSRF(account.csrf_token);
                onLogin(account);
            }
            if (mode === 'forgot') {
                await api('/auth/forgot-password', 'POST', { email });
                setNote('重設郵件已排入寄送；請查看信箱。');
            }
            if (mode === 'reset') {
                if (!passwordOk(password) || Array.from(password).length < REGISTER_LIMITS.password[0] || Array.from(password).length > REGISTER_LIMITS.password[1]) {
                    setNote(PASSWORD_RULE);
                    return;
                }
                await api('/auth/reset-password', 'POST', { token: query.get('reset_token'), password });
                history.replaceState({}, '', '/');
                setMode('login');
                setNote('密碼已更新，請重新登入。');
            }
        }
        catch (e) {
            const fields = mode !== 'register' || !(e instanceof ApiError) ? []
                : e.status === 422 ? fieldErrors(e.detail)
                    : TAKEN_FIELD[String(e.detail)] ? [{ field: TAKEN_FIELD[String(e.detail)], text: e.message }] : [];
            if (fields.length)
                showFieldErrors(fields);
            else
                setNote(errorMessage(e));
        }
        finally {
            setBusy(false);
        }
    }
    return <main className="sc-auth"><div className="sc-brand">S</div><small>SOCRATES · 共思教室</small><h1>從一個問題，<br />看見自己的原則。</h1><p className="muted">表達、追問、相遇。每個觀點都有自己的位置。</p>
    <form noValidate={mode === 'register'} onSubmit={e => { e.preventDefault(); void submit(); }} className="sc-glass">
      <h2>{{ login: '歡迎回來', register: '建立帳號', forgot: '重設登入密碼', reset: '設定新密碼' }[mode]}</h2>
      {(mode === 'login' || mode === 'register') && <><label>{mode === 'login' ? '使用者名稱或 Email' : '使用者名稱'}<input ref={usernameInput} autoComplete="username" required maxLength={mode === 'login' ? REGISTER_LIMITS.email[1] : REGISTER_LIMITS.username[1]} value={name} {...fieldProps('username')} onChange={e => { setName(e.target.value); clearField('username'); }}/></label>{fieldMessage('username')}</>}
      {(mode === 'register' || mode === 'forgot') && <><label>Email<input ref={emailInput} type="email" required maxLength={REGISTER_LIMITS.email[1]} value={email} {...fieldProps('email')} onChange={e => { setEmail(e.target.value); clearField('email'); }}/></label>{fieldMessage('email')}</>}
      {mode !== 'forgot' && <><label>密碼<input ref={passwordInput} type="password" maxLength={mode === 'login' ? LOGIN_PASSWORD_MAX : REGISTER_LIMITS.password[1]} minLength={mode === 'login' ? 1 : REGISTER_LIMITS.password[0]} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required value={password} {...fieldProps('password', mode === 'login' ? undefined : 'password-rule')} onChange={e => { const next = mode === 'login' ? { kept: e.target.value, blocked: '' } : keepPasswordChars(e.target.value); setPassword(next.kept); setBlocked(next.blocked); clearField('password'); }}/></label>{mode !== 'login' && <small id="password-rule" className="muted">{PASSWORD_RULE}</small>}{mode !== 'login' && blocked && <small className="password-blocked" role="status">已擋下不允許的字元：{blocked}</small>}{fieldMessage('password')}</>}
      <button disabled={busy}>{busy ? '處理中…' : '繼續'}</button><p role="status">{note}</p>
      <div className="sc-row"><button type="button" className="quiet" onClick={() => switchMode(mode === 'register' ? 'login' : 'register')}>{mode === 'register' ? '回到登入' : '註冊'}</button><button type="button" className="quiet" onClick={() => switchMode('forgot')}>重設密碼</button></div>
    </form></main>;
}
