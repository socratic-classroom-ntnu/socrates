import '@testing-library/jest-dom'
import { cleanup } from '@testing-library/react'
import { TextDecoder, TextEncoder } from 'node:util'
import { vi } from './testkit'

Object.defineProperty(globalThis, 'TextEncoder', { configurable: true, value: TextEncoder })
Object.defineProperty(globalThis, 'TextDecoder', { configurable: true, value: TextDecoder })
const stored = new Map<string, string>()
vi.stubGlobal('localStorage', {
  clear: () => stored.clear(), getItem: (key: string) => stored.get(key) ?? null,
  setItem: (key: string, value: string) => stored.set(key, value), removeItem: (key: string) => stored.delete(key),
})
Object.defineProperty(globalThis, 'crypto', { configurable: true, value: { randomUUID: () => '00000000-0000-4000-8000-000000000001' } })
Object.defineProperty(window, 'matchMedia', { configurable: true, value: (query: string) => ({
  matches: false, media: query, onchange: null, addListener() {}, removeListener() {},
  addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true },
}) })
Element.prototype.scrollIntoView = jest.fn()
beforeEach(() => { localStorage.clear() })
afterEach(() => { cleanup(); jest.restoreAllMocks() })
