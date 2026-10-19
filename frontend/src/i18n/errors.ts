import { ApiError } from '../api/classroomClient';

type Translate = (key: string, options?: Record<string, unknown>) => string;

// Codes that have their own sentence in common:errors; anything else falls back by HTTP status.
const KNOWN = new Set([
  'AUTH_INVALID_CREDENTIALS',
  'AUTH_TOKEN_INVALID',
  'ACCOUNT_DATA_TAKEN',
  'USERNAME_TAKEN',
  'EMAIL_TAKEN',
  'ACCOUNT_PENDING_VERIFICATION',
  'LOGIN_REQUIRED',
  'RATE_LIMITED',
]);

/** New pages translate errors by code and status only; a backend sentence (often Chinese) is never shown. */
export function errorMessage(t: Translate, error: unknown): string {
  if (!(error instanceof ApiError)) return t('common:errors.generic');
  if (error.status === 429) return t('common:errors.RATE_LIMITED');
  if (typeof error.detail === 'string' && KNOWN.has(error.detail)) return t(`common:errors.${error.detail}`);
  if (error.status === 422) return t('common:errors.invalidInput');
  if (error.status >= 500) return t('common:errors.server');
  return t('common:errors.generic');
}

export function errorCode(error: unknown): string | null {
  return error instanceof ApiError && typeof error.detail === 'string' ? error.detail : null;
}
