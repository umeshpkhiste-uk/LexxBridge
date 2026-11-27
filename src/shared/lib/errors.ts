/** Thrown with a message that's already written to be read by a user
 * (validation, business rules, e.g. "Message can't be empty"). Everything
 * else — a raw Postgres/Supabase/network error — must never reach the UI
 * verbatim, so it's replaced with GENERIC_ERROR_MESSAGE at display time. */
export class UserFacingError extends Error {}

export const GENERIC_ERROR_MESSAGE = "Something went wrong. This will resolve soon.";

export const NETWORK_ERROR_MESSAGE = "Your network is slow or offline. Check your connection and try again.";

/** Every platform words a dropped, refused or timed-out request differently
 * (browsers, iOS, Android, Supabase's own wrappers). Phrases are kept specific
 * so a database error that merely mentions e.g. the "connections" table never
 * counts as a network problem. */
export function isNetworkErrorMessage(message: string): boolean {
  return /network request failed|failed to fetch|fetch failed|load failed|networkerror|request timed out|check your connection|internet connection appears|network connection was lost|could not connect to the server|unable to resolve host|failed to send a request to the edge function|hostname could not be found/i.test(
    message,
  );
}

/** The database's rate-limit triggers (migrations 0055, 0056, 0085) raise
 * messages written for the user, all containing "please wait" or "please
 * slow down" — showing those verbatim tells someone why their post or
 * message didn't go through, instead of a vague "something went wrong". */
export function isRateLimitMessage(message: string): boolean {
  return /please (wait|slow down)/i.test(message);
}

export function friendlyErrorMessage(err: unknown): string {
  if (err instanceof UserFacingError) return err.message;
  if (err instanceof Error && isRateLimitMessage(err.message)) return err.message;
  if (err instanceof Error && isNetworkErrorMessage(err.message)) return NETWORK_ERROR_MESSAGE;
  return GENERIC_ERROR_MESSAGE;
}

/** Supabase Auth failures the user can act on, by error code. */
const AUTH_MESSAGES: Record<string, string> = {
  invalid_credentials: "Incorrect email or password.",
  email_not_confirmed: "Please confirm your email first. Check your inbox for the link.",
  user_already_exists: "An account with this email already exists. Please sign in instead.",
  email_exists: "An account with this email already exists. Please sign in instead.",
  email_address_invalid: "Enter a valid email address.",
  same_password: "Choose a password that's different from your current one.",
  over_request_rate_limit: "Too many attempts. Please wait a few minutes and try again.",
  over_email_send_rate_limit: "Too many emails requested. Please wait a few minutes and try again.",
  user_banned: "This account has been disabled. Please contact support.",
  signup_disabled: "Sign-up isn't available right now.",
  otp_expired: "That code is wrong or has expired. Request a new one.",
  sms_send_failed: "The code couldn't be sent. Please try again in a few minutes.",
  over_sms_send_rate_limit: "Too many codes requested. Please wait a few minutes and try again.",
  phone_exists: "This number is already used by another account.",
  phone_provider_disabled: "Mobile sign-in isn't available yet.",
  session_not_found: "Your session has ended. Please sign in again.",
  session_expired: "Your session has ended. Please sign in again.",
};

/** What to show for a Supabase Auth error; null when there was none. */
export function authErrorMessage(error: { message: string; code?: string; name?: string } | null): string | null {
  if (!error) return null;
  // Says which rule the password missed, so it's worth showing as it is.
  if (error.code === "weak_password") return error.message;
  if (error.code && AUTH_MESSAGES[error.code]) return AUTH_MESSAGES[error.code];
  if (error.name === "AuthRetryableFetchError" || isNetworkErrorMessage(error.message)) return NETWORK_ERROR_MESSAGE;
  return GENERIC_ERROR_MESSAGE;
}
