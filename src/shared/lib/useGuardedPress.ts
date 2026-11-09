import { useCallback, useRef } from "react";

/**
 * Wraps a press handler so a rapid double-tap — or a second tap landing
 * before an async handler (a Supabase insert/update, a submit, a send)
 * settles — is ignored instead of firing the action twice. Not for handlers
 * where fast repeated taps on the same control are the intended input (a
 * numeric keypad digit, a calendar day, a segmented-control tab).
 */
export function useGuardedPress<Args extends unknown[]>(handler: (...args: Args) => void | Promise<void>) {
  const isPendingRef = useRef(false);

  return useCallback(
    (...args: Args) => {
      if (isPendingRef.current) return;
      isPendingRef.current = true;
      try {
        const result = handler(...args);
        if (result && typeof (result as Promise<void>).finally === "function") {
          (result as Promise<void>).finally(() => {
            isPendingRef.current = false;
          });
          return;
        }
      } catch (err) {
        isPendingRef.current = false;
        throw err;
      }
      // Synchronous handler: release on the next tick rather than
      // immediately, so a same-frame double-tap still gets caught.
      setTimeout(() => {
        isPendingRef.current = false;
      }, 400);
    },
    [handler]
  );
}
