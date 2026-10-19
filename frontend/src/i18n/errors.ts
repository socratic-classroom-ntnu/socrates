import { ApiError } from '../api/classroomClient';

type Translate = (key: string, options?: Record<string, unknown>) => string;

// Codes that have their own sentence in common:errors; anything else falls back by HTTP status.
const COMMON_CODES = new Set([
  'AUTH_INVALID_CREDENTIALS',
  'AUTH_TOKEN_INVALID',
  'ACCOUNT_DATA_TAKEN',
  'USERNAME_TAKEN',
  'EMAIL_TAKEN',
  'ACCOUNT_PENDING_VERIFICATION',
  'LOGIN_REQUIRED',
  // A stale tab (another login, a dev reload) loses its CSRF token; a reload fixes it.
  'SESSION_CSRF_REQUIRED',
  'RATE_LIMITED',
]);

const SOLO_CODES = new Set([
  'SOLO_ATTEMPT_NOT_FOUND',
  'ACTIVITY_NOT_OPEN',
  'SOLO_ACTION_UNAVAILABLE',
  'SOLO_OPTION_INVALID',
  'SOLO_SUMMARY_STALE',
  'SOLO_MESSAGE_LIMIT',
  'SOLO_STEP_NOT_READY',
]);

/** New pages translate errors by code and status only; a backend sentence (often Chinese) is never shown. */
export function errorMessage(t: Translate, error: unknown, namespace = 'common'): string {
  if (!(error instanceof ApiError)) return t('common:errors.generic');
  if (error.status === 429) return t('common:errors.RATE_LIMITED');
  if (typeof error.detail === 'string' && COMMON_CODES.has(error.detail)) return t(`common:errors.${error.detail}`);
  if (typeof error.detail === 'string' && namespace === 'solo' && SOLO_CODES.has(error.detail)) return t(`solo:errors.${error.detail}`);
  if (error.status === 422) return t('common:errors.invalidInput');
  if (error.status >= 500) return t('common:errors.server');
  return t('common:errors.generic');
}

export function errorCode(error: unknown): string | null {
  return error instanceof ApiError && typeof error.detail === 'string' ? error.detail : null;
}
