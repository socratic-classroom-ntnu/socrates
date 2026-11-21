import { copyText } from './clipboard'

describe('copyText', () => {
  const original = navigator.clipboard
  afterEach(() => {
    Object.defineProperty(navigator, 'clipboard', { value: original, configurable: true })
    jest.useRealTimers()
  })

  it('uses navigator.clipboard when it works', async () => {
    const writeText = jest.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    await expect(copyText('55355E07')).resolves.toBe(true)
    expect(writeText).toHaveBeenCalledWith('55355E07')
  })

  it('falls back to execCommand when the clipboard API rejects', async () => {
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: jest.fn().mockRejectedValue(new Error('denied')) }, configurable: true })
    const exec = jest.fn().mockReturnValue(true)
    Object.defineProperty(document, 'execCommand', { value: exec, configurable: true })
    await expect(copyText('55355E07')).resolves.toBe(true)
    expect(exec).toHaveBeenCalledWith('copy')
    expect(document.querySelector('textarea')).toBeNull()
  })

  it('falls back when the clipboard API never answers', async () => {
    jest.useFakeTimers()
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: () => new Promise(() => undefined) }, configurable: true })
    Object.defineProperty(document, 'execCommand', { value: jest.fn().mockReturnValue(true), configurable: true })
    const pending = copyText('55355E07')
    jest.advanceTimersByTime(1600)
    await expect(pending).resolves.toBe(true)
  })

  it('reports failure when both paths fail', async () => {
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true })
    Object.defineProperty(document, 'execCommand', { value: jest.fn().mockReturnValue(false), configurable: true })
    await expect(copyText('55355E07')).resolves.toBe(false)
  })
})
