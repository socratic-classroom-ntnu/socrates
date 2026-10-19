import enAuth from './locales/en/auth';
import enCommon from './locales/en/common';
import enShell from './locales/en/shell';
import esAuth from './locales/es/auth';
import esCommon from './locales/es/common';
import esShell from './locales/es/shell';
import hansAuth from './locales/zh-Hans/auth';
import hansCommon from './locales/zh-Hans/common';
import hansShell from './locales/zh-Hans/shell';
import hantAuth from './locales/zh-Hant/auth';
import hantCommon from './locales/zh-Hant/common';
import hantShell from './locales/zh-Hant/shell';
import type { Locale } from './locale';

export const NAMESPACES = ['common', 'auth', 'shell'] as const;
export type Namespace = typeof NAMESPACES[number];

// Bundled up front: four small locales are cheaper than a loading state on every page.
const sourceResources = { common: hantCommon, auth: hantAuth, shell: hantShell };

export const resources: Record<Locale, Record<Namespace, unknown>> = {
  'zh-Hant': sourceResources,
  'zh-Hans': { common: hansCommon, auth: hansAuth, shell: hansShell },
  en: { common: enCommon, auth: enAuth, shell: enShell },
  es: { common: esCommon, auth: esAuth, shell: esShell },
};
