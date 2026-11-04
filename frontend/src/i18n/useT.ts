import { useTranslation } from 'react-i18next';
import './index';
import { DEFAULT_LOCALE, isLocale, type Locale } from './locale';
import type { Namespace } from './resources';

// The only way new components read translations; ESLint blocks direct react-i18next imports.
// Keys are not type-checked: i18next's key types need strictNullChecks, which this project turns off.
// keys.test.ts guards that every locale carries every zh-Hant key instead.
export function useT<N extends Namespace = 'common'>(ns: N = 'common' as N) {
  const { t, i18n } = useTranslation<N>(ns);
  const locale: Locale = isLocale(i18n.language) ? i18n.language : DEFAULT_LOCALE;
  return { t, locale };
}
