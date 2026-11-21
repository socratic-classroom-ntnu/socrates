import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import { DEFAULT_LOCALE, isLocale, type Locale, readStored, resolveLocale, writeStored } from './locale';
import { NAMESPACES, resources } from './resources';

// Before login the account preference is unknown; AuthContext re-applies it after /auth/me.
const initial = resolveLocale({
  stored: readStored(),
  account: null,
  browser: typeof navigator === 'undefined' ? [] : navigator.languages ?? [navigator.language],
});

void i18next.use(initReactI18next).init({
  resources,
  lng: initial,
  fallbackLng: DEFAULT_LOCALE,
  ns: [...NAMESPACES],
  defaultNS: 'common',
  interpolation: { escapeValue: false },
  initAsync: false,
  showSupportNotice: false,
});
document.documentElement.lang = initial;

export async function applyLocale(locale: Locale): Promise<void> {
  await i18next.changeLanguage(locale);
  writeStored(locale);
  document.documentElement.lang = locale;
}

export function currentLocale(): Locale {
  return isLocale(i18next.language) ? i18next.language : DEFAULT_LOCALE;
}

export default i18next;
