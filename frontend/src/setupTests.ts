import '@testing-library/jest-dom/vitest'
import { vi } from 'vitest'

// Node 26 exposes an unavailable experimental localStorage global that masks jsdom's.
const stored = new Map<string, string>()
vi.stubGlobal('localStorage', {
  clear: () => stored.clear(),
  getItem: (key: string) => stored.get(key) ?? null,
  setItem: (key: string, value: string) => stored.set(key, value),
  removeItem: (key: string) => stored.delete(key),
})
vi.stubGlobal('crypto', { randomUUID: () => '00000000-0000-4000-8000-000000000001' })
