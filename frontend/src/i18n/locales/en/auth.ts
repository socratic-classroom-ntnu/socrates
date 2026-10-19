import type zhHant from '../zh-Hant/auth';
import type { Shape } from '../../shape';

const auth: Shape<typeof zhHant> = {
  hero: {
    eyebrow: 'SOCRATES CLASSROOM',
    tagline: 'One question at a time, see the principles you hold.',
    sub: 'Speak up, follow up, meet each other. Every viewpoint has its place.',
  },
  fields: {
    identifier: 'Username or email',
    username: 'Username',
    email: 'Email',
    password: 'Password',
    newPassword: 'New password',
  },
  login: { title: 'Welcome back', submit: 'Log in' },
  register: {
    title: 'Create an account',
    hint: 'Use at least 12 characters. We will send a verification email after you sign up.',
    submit: 'Sign up',
  },
  forgot: {
    title: 'Reset your password',
    hint: 'Enter the email you signed up with and we will send you a reset link.',
    submit: 'Send reset email',
    sent: 'If that email is registered, a reset link is on its way.',
  },
  reset: {
    title: 'Set a new password',
    submit: 'Set new password',
    done: 'Your password has been updated. Log in with the new one.',
  },
  fieldErrors: {
    username: {
      missing: 'Please enter a username.',
      tooShort: 'The username needs at least {{min}} characters.',
      tooLong: 'The username can have at most {{max}} characters.',
      format: 'The username is not in a valid format.',
      pattern: 'Use only letters, numbers, underscores (_), dots (.) or hyphens (-), with no spaces.',
    },
    email: {
      missing: 'Please enter an email.',
      tooShort: 'The email needs at least {{min}} characters.',
      tooLong: 'The email can have at most {{max}} characters.',
      format: 'The email is not in a valid format.',
      pattern: 'The email is not in a valid format.',
    },
    password: {
      missing: 'Please enter a password.',
      tooShort: 'The password needs at least {{min}} characters.',
      tooLong: 'The password can have at most {{max}} characters.',
      format: 'The password is not in a valid format.',
      pattern: 'The password is not in a valid format.',
    },
  },
  busy: 'Working…',
  links: { login: 'Back to log in', register: 'Sign up', forgot: 'Forgot password' },
  verify: {
    title: 'Confirm your email',
    body: 'We sent a verification email to {{email}}. Open the link in it to start joining courses.',
    waiting: 'Waiting for verification. This page continues on its own once you confirm.',
    resend: 'Resend verification email',
    resent: 'Verification email sent again.',
    checked: 'I have verified',
    help: 'Nothing arrived? Check your spam folder. Wrong email? Log out and sign up again with the right one.',
    verifying: 'Verifying your email…',
    success: 'Your email is verified.',
    failed: 'This verification link has expired. Please send a new one.',
    notYet: 'Not verified yet. Open the link in the email.',
    cooldown: 'Resend in {{seconds}} s',
    localPreview: 'Local testing: open this verification link',
    loginToResend: 'Log in to resend the verification email',
    logout: 'Log out',
  },
};
export default auth;
