import { useEffect, useRef, useState } from 'react';
import { ApiError, api, setCSRF } from '../../contract/classroomClient';
import type { components } from '../../contract/classroomTypes';
import { PASSWORD_RULE, fieldErrors, fieldText, errorMessage } from '../../contract/errorText';
import { rememberRole, type EntryRole } from '../../entryRole';
import '../../styles/entrance.css';

type Account = components['schemas']['AccountView'];
type Mode = 'login' | 'register' | 'forgot' | 'reset';
type Copy = { title: string; subtitle?: string; submit: string };
type EntryCopy = Record<Mode, Copy> & { toRegister: string; toForgot: string };

export const REGISTER_LIMITS = { username: [3, 32], email: [3, 254], password: [8, 32] } as const;
const USERNAME_RE = /^[A-Za-z][A-Za-z0-9_.-]*[A-Za-z0-9]$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LOGIN_PASSWORD_MAX = 256;
export const PASSWORD_SPECIALS = '!@#$%^&*_-+=.?~';
const COPY: Record<EntryRole, EntryCopy> = {
  student: {
    login: { title: '歡迎回來', subtitle: '登入後入座', submit: '推門進入' },
    register: { title: '新生報到', subtitle: '第一次來', submit: '完成報到' },
    forgot: { title: '重設密碼', subtitle: '補發鑰匙', submit: '寄送重設信' },
    reset: { title: '設定新密碼', subtitle: '換一把新鑰匙', submit: '更新密碼' },
    toRegister: '註冊新帳號', toForgot: '忘記密碼',
  },
  teacher: {
    login: { title: '歡迎回來', submit: '繼續' },
    register: { title: '建立帳號', submit: '建立帳號' },
    forgot: { title: '重設登入密碼', submit: '寄送重設信' },
    reset: { title: '設定新密碼', submit: '更新密碼' },
    toRegister: '註冊', toForgot: '重設密碼',
  },
};

export function keepPasswordChars(value: string) {
  const ok = (c: string) => /[A-Za-z0-9]/.test(c) || PASSWORD_SPECIALS.includes(c);
  const list = Array.from(value);
  return {
    kept: list.filter(ok).slice(0, REGISTER_LIMITS.password[1]).join(''),
    blocked: [...new Set(list.filter(c => !ok(c)).map(c => c === ' ' ? '空白' : c))].join(' '),
  };
}
export function passwordOk(value: string) {
  const special = (c: string) => PASSWORD_SPECIALS.includes(c);
  const list = Array.from(value);
  return list.every(c => /[A-Za-z0-9]/.test(c) || special(c))
    && /[A-Z]/.test(value) && /[a-z]/.test(value) && /[0-9]/.test(value) && list.some(special);
}
const chars = (value: string) => Array.from(value).length;
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
const TAKEN_FIELD: Record<string, string> = { USERNAME_TAKEN: 'username', EMAIL_TAKEN: 'email' };

function Chalkboard() {
  return <section className="entrance-chalkboard" aria-label="蘇格拉底課堂">
    <div className="entrance-chalkboard-mark"><i>問</i><span>SOCRATES · 蘇格拉底課堂</span></div>
    <h2>從一個問題，<br/>看見自己的原則。</h2>
    <p>表達、追問、相遇。每個觀點都有自己的位置。</p>
    <span className="entrance-chalkboard-chalk" aria-hidden="true"/>
  </section>;
}

export function authErrorText(e: unknown): string {
  if (e instanceof ApiError && e.detail === 'ORIGIN_BINDING_REQUIRED') return '目前的網址未被伺服器允許，請改用正確的網址開啟。';
  if (e instanceof ApiError && e.status === 0) return '連不上伺服器，請確認網路後再試一次。';
  if (e instanceof ApiError && e.status >= 500) return '伺服器暫時出了問題，請稍後再試。';
  return errorMessage(e);
}

export function Auth({ onLogin, variant = 'student' }: { onLogin: (account: Account) => void; variant?: EntryRole }) {
  const [mode, setMode] = useState<Mode>('login');
  const [name, setName] = useState(''), [email, setEmail] = useState(''), [password, setPassword] = useState('');
  const [blocked, setBlocked] = useState('');
  const [note, setNote] = useState(''), [failed, setFailed] = useState(false), [busy, setBusy] = useState(false);
  const [fieldError, setFieldError] = useState<Record<string, string>>({});
  const usernameInput = useRef<HTMLInputElement>(null), emailInput = useRef<HTMLInputElement>(null), passwordInput = useRef<HTMLInputElement>(null);
  const inputs = { username: usernameInput, email: emailInput, password: passwordInput };
  const query = new URLSearchParams(location.search);
  const say = (text: string, isError = false) => { setNote(text); setFailed(isError); };
  const showFieldErrors = (list: { field: string; text: string }[]) => {
    setFieldError(Object.fromEntries(list.map(f => [f.field, f.text]))); say('');
    inputs[list[0].field]?.current?.focus();
  };
  const clearField = (field: string) => setFieldError(current => {
    if (!current[field]) return current;
    const next = { ...current }; delete next[field]; return next;
  });
  const go = (next: Mode) => { setMode(next); setFieldError({}); setBlocked(''); say(''); };
  const fieldProps = (field: string, hint?: string) => mode === 'register' && fieldError[field]
    ? { 'aria-invalid': true, 'aria-describedby': [hint, `register-${field}-error`].filter(Boolean).join(' ') }
    : hint ? { 'aria-describedby': hint } : {};
  const fieldMessage = (field: string) => mode === 'register' && fieldError[field]
    ? <small id={`register-${field}-error`} role="alert">{fieldError[field]}</small> : null;
  useEffect(() => {
    const token = new URLSearchParams(location.search).get('verify_token');
    if (token) void api('/auth/verify', 'POST', { token }).then(() => { say('Email 已驗證，請登入。'); history.replaceState({}, '', '/'); }).catch(e => say(authErrorText(e), true));
    if (new URLSearchParams(location.search).has('reset_token')) setMode('reset');
  }, []);
  async function submit() {
    setBusy(true);
    try {
      if (mode === 'login') {
        const account: Account = await api('/auth/login', 'POST', { login: name, password });
        setCSRF(account.csrf_token); onLogin(account);
      }
      if (mode === 'register') {
        const problems = registerProblems({ username: name, email: email.trim(), password });
        if (problems.length) { showFieldErrors(problems); return; }
        const account: Account = await api('/auth/register', 'POST', { username: name, email: email.trim(), password });
        setCSRF(account.csrf_token); onLogin(account);
      }
      if (mode === 'forgot') { await api('/auth/forgot-password', 'POST', { email }); say('重設郵件已排入寄送；請查看信箱。'); }
      if (mode === 'reset') {
        if (!passwordOk(password) || chars(password) < REGISTER_LIMITS.password[0] || chars(password) > REGISTER_LIMITS.password[1]) { say(PASSWORD_RULE, true); return; }
        await api('/auth/reset-password', 'POST', { token: query.get('reset_token'), password });
        history.replaceState({}, '', '/'); setMode('login'); say('密碼已更新，請重新登入。');
      }
    } catch (e) {
      const fields = mode !== 'register' || !(e instanceof ApiError) ? []
        : e.status === 422 ? fieldErrors(e.detail)
        : TAKEN_FIELD[String(e.detail)] ? [{ field: TAKEN_FIELD[String(e.detail)], text: e.message }] : [];
      if (fields.length) showFieldErrors(fields); else say(authErrorText(e), true);
    } finally { setBusy(false); }
  }
  const teacher = variant === 'teacher';
  const otherRole: EntryRole = teacher ? 'student' : 'teacher';
  const words = COPY[variant], copy = words[mode];
  return <main className={'entrance' + (teacher ? ' entrance--teacher' : '')}>
    <div className="entrance-brand"><i>問</i>蘇格拉底課堂</div>
    {!teacher && <div className="entrance-leaf" aria-hidden="true"><span className="glass"/><span className="panel upper"/><span className="panel lower"/><span className="handle"/></div>}
    <div className="entrance-stage">{teacher && <Chalkboard/>}<form noValidate={mode === 'register'} className="entrance-sign" onSubmit={e => { e.preventDefault(); void submit(); }}>
      <span className="screw tl"/><span className="screw tr"/><span className="screw bl"/><span className="screw br"/>
      {teacher ? <h1 className="entrance-title">{copy.title}</h1> : <header className="entrance-plate"><h1>［{copy.title}］</h1><small>{copy.subtitle}</small></header>}
      {(mode === 'login' || mode === 'register') && <><label>{mode === 'login' ? '使用者名稱或 Email' : '使用者名稱'}<input ref={usernameInput} autoComplete="username" required maxLength={mode === 'login' ? REGISTER_LIMITS.email[1] : REGISTER_LIMITS.username[1]} value={name} {...fieldProps('username')} onChange={e => { setName(e.target.value); clearField('username'); }}/></label>{fieldMessage('username')}</>}
      {(mode === 'register' || mode === 'forgot') && <><label>Email<input ref={emailInput} type="email" required maxLength={REGISTER_LIMITS.email[1]} value={email} {...fieldProps('email')} onChange={e => { setEmail(e.target.value); clearField('email'); }}/></label>{fieldMessage('email')}</>}
      {mode !== 'forgot' && <><label>{mode === 'reset' ? '新密碼' : '密碼'}<input ref={passwordInput} type="password" maxLength={mode === 'login' ? LOGIN_PASSWORD_MAX : REGISTER_LIMITS.password[1]} minLength={mode === 'login' ? 1 : REGISTER_LIMITS.password[0]} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required value={password} {...fieldProps('password', mode === 'login' ? undefined : 'password-rule')} onChange={e => { const next = mode === 'login' ? { kept: e.target.value, blocked: '' } : keepPasswordChars(e.target.value); setPassword(next.kept); setBlocked(next.blocked); clearField('password'); }}/></label>{mode !== 'login' && <small id="password-rule">{PASSWORD_RULE}</small>}{blocked && <small role="status">已擋下不允許的字元：{blocked}</small>}{fieldMessage('password')}</>}
      <p role="status" className={'entrance-note' + (failed ? ' error' : '')}>{note}</p>
      <button className="entrance-primary" aria-label={teacher ? '繼續' : undefined} disabled={busy}>{busy ? '處理中…' : copy.submit + ' →'}</button>
      <nav className={'entrance-links' + (teacher ? ' entrance-links--outlined' : '')}>{mode === 'login' ? <><button type="button" onClick={() => go('register')}>{words.toRegister}</button><button type="button" onClick={() => go('forgot')}>{words.toForgot}</button></> : <button type="button" onClick={() => go('login')}>{mode === 'register' ? '已有帳號，回到登入' : '回到登入'}</button>}</nav>
      <a className="entrance-switch" href={`/${otherRole}`} onClick={() => rememberRole(otherRole)}>{teacher ? '我是學生？換個入口' : '我是老師？換個入口'}</a>
    </form></div>
  </main>;
}
