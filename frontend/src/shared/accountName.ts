import type { components } from '../contract/classroomTypes'

type Account = Pick<components['schemas']['AccountView'], 'username' | 'display_name'>

/** The name to show: a guest's nickname (the backend's display_name, never the username's random
 * suffix — a nickname may itself contain "-"), otherwise the username. */
export function accountName(account: Account | null | undefined): string {
  if (!account) return ''
  return account.display_name || account.username
}
