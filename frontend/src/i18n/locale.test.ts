import { LOCALES, normalizeBrowserLocale, readStored, resolveLocale, STORAGE_KEY, writeStored } from './locale';

test('resolve_locale_prefers_account', () => {
  expect(resolveLocale({ stored: 'en', account: 'es', browser: ['zh-TW'] })).toBe('es');
});

test('resolve_locale_uses_valid_storage_before_browser', () => {
  expect(resolveLocale({ stored: 'zh-Hans', account: null, browser: ['en-US'] })).toBe('zh-Hans');
});

test('resolve_locale_ignores_garbage_storage', () => {
  expect(resolveLocale({ stored: 'xx', account: null, browser: ['en-US'] })).toBe('en');
});

test('resolve_locale_takes_first_supported_browser_language', () => {
  expect(resolveLocale({ stored: null, account: undefined, browser: ['fr-FR', 'es-MX', 'en'] })).toBe('es');
});

test('resolve_locale_bare_zh_falls_back', () => {
  expect(resolveLocale({ stored: null, account: null, browser: ['zh', 'pt-BR'] })).toBe('zh-Hant');
});

test.each([
  ['zh-TW', 'zh-Hant'],
  ['zh-HK', 'zh-Hant'],
  ['zh-MO', 'zh-Hant'],
  ['zh-Hant-TW', 'zh-Hant'],
  ['zh-CN', 'zh-Hans'],
  ['zh-SG', 'zh-Hans'],
  ['zh-Hans', 'zh-Hans'],
  ['zh-cn', 'zh-Hans'],
  ['es-MX', 'es'],
  ['es', 'es'],
  ['en-GB', 'en'],
  ['zh', 'null'],
  ['fr', 'null'],
  ['', 'null'],
])('normalize %s', (tag, want) => {
  expect(String(normalizeBrowserLocale(tag))).toBe(want);
});

test('stored locale round-trips and survives a broken storage', () => {
  writeStored('en');
  expect(localStorage.getItem(STORAGE_KEY)).toBe('en');
  expect(readStored()).toBe('en');
  jest.spyOn(localStorage, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
  expect(readStored()).toBeNull();
});

test('supported locales are exactly the four agreed ones', () => {
  expect(LOCALES).toEqual(['zh-Hant', 'zh-Hans', 'en', 'es']);
});
