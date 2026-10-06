import { supabase } from "@/shared/lib/supabase";

export const FEEDBACK_MAX_WORDS = 500;

export function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

/** Sends a suggestion to the app owner via the send-feedback edge function.
 * The 500-word check here is just for a fast, local error message — the
 * function enforces the same limit server-side, since that's the one that
 * actually matters. */
export async function submitFeedback(comment: string): Promise<void> {
  const trimmed = comment.trim();
  if (!trimmed) throw new Error("Write a comment before sending.");
  if (countWords(trimmed) > FEEDBACK_MAX_WORDS) {
    throw new Error(`Please keep your comment under ${FEEDBACK_MAX_WORDS} words.`);
  }
  const { error } = await supabase.functions.invoke("send-feedback", { body: { comment: trimmed } });
  if (error) throw new Error(error.message || "Couldn't send your comment. Try again.");
}
