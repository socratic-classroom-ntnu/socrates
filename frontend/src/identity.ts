const KEY = 'socrates.learnerId'

export function getLearnerId(): string {
  const existing = localStorage.getItem(KEY)
  if (existing) return existing
  const created = crypto.randomUUID()
  localStorage.setItem(KEY, created)
  return created
}
