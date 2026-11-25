import { evaluatePasswordRules, passwordRulesPass } from './passwordChecks'

test('an empty password meets none of the three rules', () => {
  expect(evaluatePasswordRules('')).toEqual({ length: false, letterCase: false, numberSymbol: false })
})

test('a password with upper and lower case, a number and a symbol meets all three', () => {
  expect(evaluatePasswordRules('Abcdefg1!')).toEqual({ length: true, letterCase: true, numberSymbol: true })
  expect(passwordRulesPass('Abcdefg1!')).toBe(true)
})

test('missing either case fails the case rule', () => {
  expect(evaluatePasswordRules('abcdefg1!').letterCase).toBe(false)
  expect(evaluatePasswordRules('ABCDEFG1!').letterCase).toBe(false)
})

test('the third rule needs both a number and a symbol', () => {
  expect(evaluatePasswordRules('Abcdefgh!').numberSymbol).toBe(false)
  expect(evaluatePasswordRules('Abcdefg12').numberSymbol).toBe(false)
})

test('only the registration symbols count as symbols', () => {
  expect(evaluatePasswordRules('Abcdefg1(').numberSymbol).toBe(false)
  for (const symbol of '!@#$%^&*_-+=.?~') {
    expect(evaluatePasswordRules(`Abcdefg1${symbol}`).numberSymbol).toBe(true)
  }
})

test('the length rule allows 8 to 32 characters', () => {
  expect(evaluatePasswordRules('Abcde1!').length).toBe(false)
  expect(evaluatePasswordRules('Abcdef1!').length).toBe(true)
  expect(evaluatePasswordRules('Abcdef1!' + 'a'.repeat(24)).length).toBe(true)
  expect(evaluatePasswordRules('Abcdef1!' + 'a'.repeat(25)).length).toBe(false)
  expect(passwordRulesPass('Abcdef1!' + 'a'.repeat(25))).toBe(false)
})
