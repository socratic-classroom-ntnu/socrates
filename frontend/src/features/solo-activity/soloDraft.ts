export function soloDraftKey(attemptId: string, scenarioIndex: number) {
  return `solo:draft:${attemptId}:scenario:${scenarioIndex}:composer`
}

export function readSoloDraft(key: string): string {
  try {
    return window.localStorage.getItem(key) ?? ''
  } catch {
    return ''
  }
}

export function writeSoloDraft(key: string, value: string) {
  try {
    if (value) window.localStorage.setItem(key, value)
    else window.localStorage.removeItem(key)
  } catch {
    // Draft persistence must never block the conversation UI.
  }
}

export function clearSoloDraft(key: string) {
  try {
    window.localStorage.removeItem(key)
  } catch {
    // Draft persistence must never block the conversation UI.
  }
}
