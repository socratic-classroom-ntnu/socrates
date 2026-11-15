import enAuth from './locales/en/auth';
import enCommon from './locales/en/common';
import enEditor from './locales/en/editor';
import enHome from './locales/en/home';
import enJoin from './locales/en/join';
import enLearn from './locales/en/learn';
import enShell from './locales/en/shell';
import enSolo from './locales/en/solo';
import enPractice from './locales/en/practice';
import enTeach from './locales/en/teach';
import esAuth from './locales/es/auth';
import esCommon from './locales/es/common';
import esEditor from './locales/es/editor';
import esHome from './locales/es/home';
import esJoin from './locales/es/join';
import esLearn from './locales/es/learn';
import esShell from './locales/es/shell';
import esSolo from './locales/es/solo';
import esPractice from './locales/es/practice';
import esTeach from './locales/es/teach';
import hansAuth from './locales/zh-Hans/auth';
import hansCommon from './locales/zh-Hans/common';
import hansEditor from './locales/zh-Hans/editor';
import hansHome from './locales/zh-Hans/home';
import hansJoin from './locales/zh-Hans/join';
import hansLearn from './locales/zh-Hans/learn';
import hansShell from './locales/zh-Hans/shell';
import hansSolo from './locales/zh-Hans/solo';
import hansPractice from './locales/zh-Hans/practice';
import hansTeach from './locales/zh-Hans/teach';
import hantAuth from './locales/zh-Hant/auth';
import hantCommon from './locales/zh-Hant/common';
import hantEditor from './locales/zh-Hant/editor';
import hantHome from './locales/zh-Hant/home';
import hantJoin from './locales/zh-Hant/join';
import hantLearn from './locales/zh-Hant/learn';
import hantShell from './locales/zh-Hant/shell';
import hantSolo from './locales/zh-Hant/solo';
import hantPractice from './locales/zh-Hant/practice';
import hantTeach from './locales/zh-Hant/teach';
import type { Locale } from './locale';

export const NAMESPACES = ['common', 'auth', 'shell', 'teach', 'home', 'join', 'learn', 'editor', 'solo', 'practice'] as const;
export type Namespace = typeof NAMESPACES[number];

// Bundled up front: four small locales are cheaper than a loading state on every page.
const sourceResources = { common: hantCommon, auth: hantAuth, shell: hantShell, teach: hantTeach, home: hantHome, join: hantJoin, learn: hantLearn, editor: hantEditor, solo: hantSolo, practice: hantPractice };

export const resources: Record<Locale, Record<Namespace, unknown>> = {
  'zh-Hant': sourceResources,
  'zh-Hans': { common: hansCommon, auth: hansAuth, shell: hansShell, teach: hansTeach, home: hansHome, join: hansJoin, learn: hansLearn, editor: hansEditor, solo: hansSolo, practice: hansPractice },
  en: { common: enCommon, auth: enAuth, shell: enShell, teach: enTeach, home: enHome, join: enJoin, learn: enLearn, editor: enEditor, solo: enSolo, practice: enPractice },
  es: { common: esCommon, auth: esAuth, shell: esShell, teach: esTeach, home: esHome, join: esJoin, learn: esLearn, editor: esEditor, solo: esSolo, practice: esPractice },
};
