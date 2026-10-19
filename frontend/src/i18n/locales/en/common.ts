import type zhHant from '../zh-Hant/common';
import type { Shape } from '../../shape';

const common: Shape<typeof zhHant> = {
  brand: 'Socrates Classroom',
  loading: 'Loading…',
  notFound: {
    title: 'Page not found',
    body: 'The address may be mistyped, or this page has been removed.',
    back: 'Back to home',
  },
  errors: {
    AUTH_INVALID_CREDENTIALS: 'The username, email or password is incorrect.',
    AUTH_TOKEN_INVALID: 'This link has expired. Please request a new one.',
    ACCOUNT_DATA_TAKEN: 'These account details are already in use. Log in or reset your password.',
    USERNAME_TAKEN: 'That username is taken. Please choose another.',
    EMAIL_TAKEN: 'That email is already registered. Log in instead, or reset your password if you forgot it.',
    ACCOUNT_PENDING_VERIFICATION: 'That username or email is registered and waiting for email verification. If it is yours, log in and resend the verification email. If not, it is released once the link expires (24 hours after the last email), and you can sign up then.',
    LOGIN_REQUIRED: 'Please log in first.',
    RATE_LIMITED: 'Too many attempts. Please wait a moment and try again.',
    invalidInput: 'Some fields are not in the right format. Please check and try again.',
    server: 'The server cannot handle this right now. Please try again later.',
    generic: 'That did not go through. Please try again later.',
  },
  comingSoon: {
    title: 'Coming soon',
    body: 'This feature is still being built and will open later.',
    back: 'Back to home',
  },
};
export default common;
