/** Thrown with a message that's already written to be read by a user
 * (validation, business rules, e.g. "Message can't be empty"). Everything
 * else — a raw Postgres/Supabase/network error — must never reach the UI
 * verbatim, so it's replaced with GENERIC_ERROR_MESSAGE at display time. */
export class UserFacingError extends Error {}

export const GENERIC_ERROR_MESSAGE = "Something went wrong. This will resolve soon.";

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
  return GENERIC_ERROR_MESSAGE;
}
