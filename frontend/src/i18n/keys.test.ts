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

test('every locale has exactly the zh-Hant keys', () => {
  for (const ns of NAMESPACES) {
    const expected = flatKeys(resources['zh-Hant'][ns]).sort();
    for (const locale of LOCALES) {
      expect({ locale, ns, keys: flatKeys(resources[locale][ns]).sort() })
        .toEqual({ locale, ns, keys: expected });
    }
  }
});

test('no empty translations', () => {
  for (const locale of LOCALES) for (const ns of NAMESPACES) {
    for (const value of flatValues(resources[locale][ns])) expect(value.trim()).not.toBe('');
  }
});

test('english and spanish contain no CJK characters', () => {
  for (const locale of ['en', 'es'] as const) for (const ns of NAMESPACES) {
    for (const value of flatValues(resources[locale][ns])) expect(value).not.toMatch(/[㐀-鿿]/);
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
