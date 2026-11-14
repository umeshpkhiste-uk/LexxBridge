/** Thrown with a message that's already written to be read by a user
 * (validation, business rules, e.g. "Message can't be empty"). Everything
 * else — a raw Postgres/Supabase/network error — must never reach the UI
 * verbatim, so it's replaced with GENERIC_ERROR_MESSAGE at display time. */
export class UserFacingError extends Error {}

export const GENERIC_ERROR_MESSAGE = "Something went wrong. This will resolve soon.";

export function friendlyErrorMessage(err: unknown): string {
  if (err instanceof UserFacingError) return err.message;
  return GENERIC_ERROR_MESSAGE;
}
