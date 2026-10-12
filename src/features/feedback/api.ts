import { supabase } from "@/shared/lib/supabase";

export const FEEDBACK_MAX_WORDS = 500;
/** Hard character cap, independent of the word count — a single no-space
 * "word" of arbitrary length would otherwise pass the word-count check
 * while still being an oversized payload. */
export const FEEDBACK_MAX_CHARS = 4000;

export function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

/** Strips null bytes and other non-printable control characters (keeping
 * newlines/tabs), collapses surrounding whitespace. This text only ever
 * becomes a plain-text email body (never HTML) and is never used to build
 * a SQL string, so this is a payload-hygiene pass, not an injection fix. */
export function sanitizeFeedback(text: string): string {
  return text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim();
}

/** Sends a suggestion to the app owner via the send-feedback edge function.
 * The checks here are just for a fast, local error message — the function
 * enforces the same limits server-side, since that's the one that actually
 * matters. */
export async function submitFeedback(comment: string): Promise<void> {
  const trimmed = sanitizeFeedback(comment);
  if (!trimmed) throw new Error("Write a comment before sending.");
  if (trimmed.length > FEEDBACK_MAX_CHARS) {
    throw new Error(`Please keep your comment under ${FEEDBACK_MAX_CHARS} characters.`);
  }
  if (countWords(trimmed) > FEEDBACK_MAX_WORDS) {
    throw new Error(`Please keep your comment under ${FEEDBACK_MAX_WORDS} words.`);
  }
  const { error } = await supabase.functions.invoke("send-feedback", { body: { comment: trimmed } });
  if (error) throw new Error(error.message || "Couldn't send your comment. Try again.");
}
