// Compatibility surface keeps the established behavior assertions on Jest.
export const vi = {
  fn: jest.fn,
  spyOn: jest.spyOn,
  mock: jest.mock,
  restoreAllMocks: jest.restoreAllMocks,
  clearAllMocks: jest.clearAllMocks,
  resetAllMocks: jest.resetAllMocks,
  useFakeTimers: jest.useFakeTimers,
  useRealTimers: jest.useRealTimers,
  advanceTimersByTime: jest.advanceTimersByTime,
  stubGlobal(name: string, value: unknown) {
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value })
  },
}
