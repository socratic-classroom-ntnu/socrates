import { LOCALES } from './locale';
import { NAMESPACES, resources } from './resources';

function flatKeys(value: unknown, prefix = ''): string[] {
  if (typeof value === 'string') return [prefix];
  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
    flatKeys(child, prefix ? `${prefix}.${key}` : key));
}

function flatValues(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  return Object.values(value as Record<string, unknown>).flatMap(flatValues);
}

// en／es 可以在 zh-Hant 既有的 key 上加 _one／_other（i18next 依 count 挑單複數）
const PLURAL_LOCALES = ['en', 'es'] as const;
const PLURAL = /_(one|other)$/;

test('every locale has exactly the zh-Hant keys', () => {
  for (const ns of NAMESPACES) {
    const expected = flatKeys(resources['zh-Hant'][ns]).sort();
    for (const locale of LOCALES) {
      const plural = (PLURAL_LOCALES as readonly string[]).includes(locale);
      const keys = flatKeys(resources[locale][ns]).filter(key => !(plural && PLURAL.test(key))).sort();
      expect({ locale, ns, keys }).toEqual({ locale, ns, keys: expected });
    }
  }
});

test('plural suffixes come in pairs on existing keys', () => {
  for (const ns of NAMESPACES) {
    const base = new Set(flatKeys(resources['zh-Hant'][ns]));
    for (const locale of PLURAL_LOCALES) {
      const keys = new Set(flatKeys(resources[locale][ns]));
      for (const key of keys) {
        if (!PLURAL.test(key)) continue;
        const stem = key.replace(PLURAL, '');
        expect({ locale, ns, key, base: base.has(stem) }).toEqual({ locale, ns, key, base: true });
        expect({ locale, ns, key, pair: keys.has(stem + '_one') && keys.has(stem + '_other') }).toEqual({ locale, ns, key, pair: true });
      }
    }
  }
});

test('english count nouns have a singular form in en and es', () => {
  // 「{{count}} questions」這類句子在 en 是複數名詞，1 的時候要換成單數
  for (const ns of NAMESPACES) {
    const en = flatKeys(resources.en[ns]);
    const pick = (tree: unknown, key: string) => key.split('.').reduce((node, part) => (node as Record<string, unknown>)[part], tree);
    for (const key of en) {
      if (PLURAL.test(key) || !/\{\{count\}\} [a-z]+s\b/.test(pick(resources.en[ns], key) as string)) continue;
      for (const locale of PLURAL_LOCALES) {
        expect({ locale, ns, key, one: typeof pick(resources[locale][ns], key + '_one') }).toEqual({ locale, ns, key, one: 'string' });
      }
    }
  }
});

test('no empty translations', () => {
  for (const locale of LOCALES) for (const ns of NAMESPACES) {
    for (const value of flatValues(resources[locale][ns])) expect(value.trim()).not.toBe('');
  }
});

test('english and spanish contain no CJK characters or fullwidth punctuation', () => {
  for (const locale of ['en', 'es'] as const) for (const ns of NAMESPACES) {
    for (const value of flatValues(resources[locale][ns])) expect(value).not.toMatch(/[\u3400-\u9fff\u3000-\u303f\u30fb\uff00-\uffef]/);
  }
});

test('interpolation placeholders match zh-Hant in every locale', () => {
  const placeholders = (text: string) => (text.match(/\{\{\s*\w+\s*\}\}/g) ?? []).sort();
  for (const ns of NAMESPACES) {
    const base = resources['zh-Hant'][ns];
    for (const key of flatKeys(base)) {
      const pick = (tree: unknown) => key.split('.').reduce((node, part) => (node as Record<string, unknown>)[part], tree) as string;
      for (const locale of LOCALES) expect(placeholders(pick(resources[locale][ns]))).toEqual(placeholders(pick(base)));
    }
  }
});
