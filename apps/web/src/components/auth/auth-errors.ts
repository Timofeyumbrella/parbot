import { PASSWORD_MIN_LENGTH } from './schema';

type AuthFailure = { code?: string | null; message?: string };

const MESSAGES: Record<string, string> = {
  invalid_credentials: 'Wrong email or password.',
  email_not_confirmed: 'Confirm your email first. The link is in your inbox.',
  user_already_exists: 'An account with this email already exists. Sign in instead.',
  email_exists: 'An account with this email already exists. Sign in instead.',
  weak_password: `Choose a stronger password with at least ${PASSWORD_MIN_LENGTH} characters.`,
  same_password: 'Choose a password that differs from the current one.',
  over_request_rate_limit: 'Too many attempts. Wait a minute and try again.',
  over_email_send_rate_limit:
    'Too many emails were sent to this address. Wait a while and try again.',
  signup_disabled: 'Sign up is switched off at the moment.',
  user_not_found: 'No account uses this email.',
  session_expired: 'Your session expired. Sign in again.',
};

/** Supabase auth errors carry a stable code. Turn the ones a visitor can act on into plain words. */
export const authErrorMessage = (error: AuthFailure) => {
  const known = error.code ? MESSAGES[error.code] : undefined;

  if (known) {
    return known;
  }

  if (/already registered/i.test(error.message ?? '')) {
    return MESSAGES.user_already_exists!;
  }

  return error.message?.trim() || 'Something went wrong. Try again.';
};
