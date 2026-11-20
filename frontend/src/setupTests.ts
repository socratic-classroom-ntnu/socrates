import '@testing-library/jest-dom';
import { cleanup } from '@testing-library/react';
import { TextDecoder, TextEncoder } from 'node:util';
import { vi } from './testkit';
import { applyLocale } from './i18n';
Object.defineProperty(globalThis, 'TextEncoder', { configurable: true, value: TextEncoder });
Object.defineProperty(globalThis, 'TextDecoder', { configurable: true, value: TextDecoder });
const stored = new Map();
vi.stubGlobal('localStorage', {
    clear: () => stored.clear(), getItem: (key) => stored.get(key) ?? null,
    setItem: (key, value) => stored.set(key, value), removeItem: (key) => stored.delete(key),
});
Object.defineProperty(globalThis, 'crypto', { configurable: true, value: { randomUUID: () => '00000000-0000-4000-8000-000000000001' } });
Object.defineProperty(window, 'matchMedia', { configurable: true, value: (query) => ({
        matches: false, media: query, onchange: null, addListener() { }, removeListener() { },
        addEventListener() { }, removeEventListener() { }, dispatchEvent() { return true; },
    }) });
Element.prototype.scrollIntoView = jest.fn();
// 測試裡的路由器預設跟 App.tsx 用同一組 future 設定，不必每個檔案各寫一次。
jest.mock('react-router-dom', () => {
    const { createElement } = jest.requireActual('react');
    const actual = jest.requireActual('react-router-dom');
    const { ROUTER_FUTURE } = jest.requireActual('./app/routerFuture');
    return {
        ...actual,
        MemoryRouter: (props) => createElement(actual.MemoryRouter, { future: ROUTER_FUTURE, ...props }),
        BrowserRouter: (props) => createElement(actual.BrowserRouter, { future: ROUTER_FUTURE, ...props }),
    };
});
// Tests read zh-Hant text unless they switch language themselves; jsdom reports en-US.
beforeEach(async () => { localStorage.clear(); await applyLocale('zh-Hant'); localStorage.clear(); });
afterEach(() => { cleanup(); jest.restoreAllMocks(); });
