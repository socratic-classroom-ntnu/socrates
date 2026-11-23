// 跟註冊同一套規則（後端 identity_access/contracts.py 的 password_policy、PASSWORD_SPECIALS）。
// 空白與其他符號不在這三條裡：照需求由後端擋，錯誤顯示在新密碼欄下面。
const SYMBOLS = /[!@#$%^&*_\-+=.?~]/

export type PasswordRuleKey = 'length' | 'letterCase' | 'numberSymbol'

export const PASSWORD_RULE_KEYS: readonly PasswordRuleKey[] = ['length', 'letterCase', 'numberSymbol']

/** 新密碼三條規則各自是否符合；規則清單與「更新密碼」按鈕都用這一份。 */
export function evaluatePasswordRules(password: string): Record<PasswordRuleKey, boolean> {
  const length = Array.from(password).length
  return {
    length: length >= 8 && length <= 32,
    letterCase: /[A-Z]/.test(password) && /[a-z]/.test(password),
    numberSymbol: /[0-9]/.test(password) && SYMBOLS.test(password),
  }
}

export function passwordRulesPass(password: string): boolean {
  return PASSWORD_RULE_KEYS.every(key => evaluatePasswordRules(password)[key])
}
