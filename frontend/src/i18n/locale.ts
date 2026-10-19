// Interface languages. zh-Hant is the source language and the fallback (spec §4.8).
export const LOCALES = ['zh-Hant', 'zh-Hans', 'en', 'es'] as const;
export type Locale = typeof LOCALES[number];
export const DEFAULT_LOCALE: Locale = 'zh-Hant';
export const STORAGE_KEY = 'socrates.locale';

// Each language is named in itself, so these four labels are never translated.
export const LANGUAGE_NAMES: Record<Locale, string> = {
  'zh-Hant': '繁體中文',
  'zh-Hans': '简体中文',
  en: 'English',
  es: 'Español',
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

export function normalizeBrowserLocale(tag: string): Locale | null {
  const parts = tag.toLowerCase().split(/[-_]/);
  const [language, second] = parts;
  if (language === 'en') return 'en';
  if (language === 'es') return 'es';
  if (language !== 'zh' || !second) return null;
  if (second === 'hant' || ['tw', 'hk', 'mo'].includes(second)) return 'zh-Hant';
  if (second === 'hans' || ['cn', 'sg'].includes(second)) return 'zh-Hans';
  return null;
}

export function resolveLocale(input: {
  stored: string | null;
  account: Locale | null | undefined;
  browser: readonly string[];
}): Locale {
  if (input.account) return input.account;
  if (isLocale(input.stored)) return input.stored;
  for (const tag of input.browser) {
    const locale = normalizeBrowserLocale(tag);
    if (locale) return locale;
  }
  return DEFAULT_LOCALE;
}

export function readStored(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function writeStored(locale: Locale): void {
  try {
    localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    // Private mode or blocked storage: the account preference still carries the choice.
  }
}
