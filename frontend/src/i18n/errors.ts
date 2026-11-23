import { ApiError } from '../contract/classroomClient';

type Translate = (key: string, options?: Record<string, unknown>) => string;

// Codes that have their own sentence in common:errors; anything else falls back by HTTP status.
const COMMON_CODES = new Set([
  'AUTH_INVALID_CREDENTIALS',
  'AUTH_TOKEN_INVALID',
  'ACCOUNT_DATA_TAKEN',
  'USERNAME_TAKEN',
  'EMAIL_TAKEN',
  'ACCOUNT_PENDING_VERIFICATION',
  'ACCOUNT_ROLE_FORBIDDEN',
  // 我的對話：每日上限（429）、找不到題目、平台連線不能用
  'PRACTICE_DAILY_LIMIT',
  'PRACTICE_TOPIC_NOT_FOUND',
  'PRACTICE_UNAVAILABLE',
  'LOGIN_REQUIRED',
  // A stale tab (another login, a dev reload) loses its CSRF token; a reload fixes it.
  'SESSION_CSRF_REQUIRED',
  'RATE_LIMITED',
  'GUEST_EXPIRED',
  'GUEST_JOIN_DISABLED',
]);

const SOLO_CODES = new Set([
  'SOLO_ATTEMPT_NOT_FOUND',
  'ACTIVITY_NOT_OPEN',
  'ACTIVITY_ENDED',
  'SOLO_ACTION_UNAVAILABLE',
  'SOLO_REVISE_HINT_INVALID',
  'SOLO_SUMMARY_STALE',
  'SOLO_MESSAGE_LIMIT',
  'SOLO_STEP_NOT_READY',
]);

/** New pages translate errors by code and status only; a backend sentence (often Chinese) is never shown. */
export function errorMessage(t: Translate, error: unknown, namespace = 'common'): string {
  if (!(error instanceof ApiError)) return t('common:errors.generic');
  // 錯誤碼有自己的句子就用它；429 的通用說法只是沒有句子時的退路
  if (typeof error.detail === 'string' && COMMON_CODES.has(error.detail)) return t(`common:errors.${error.detail}`);
  if (error.status === 429) return t('common:errors.RATE_LIMITED');
  if (typeof error.detail === 'string' && namespace === 'solo' && SOLO_CODES.has(error.detail)) return t(`solo:errors.${error.detail}`);
  if (error.status === 422) return t('common:errors.invalidInput');
  if (error.status >= 500) return t('common:errors.server');
  return t('common:errors.generic');
}

export function errorCode(error: unknown): string | null {
  return error instanceof ApiError && typeof error.detail === 'string' ? error.detail : null;
}
