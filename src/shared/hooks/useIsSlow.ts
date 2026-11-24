import { useEffect, useState } from "react";

/** How long something may load before the user is told their network is slow. */
export const SLOW_AFTER_MS = 6_000;

/** True once `loading` has stayed true for SLOW_AFTER_MS. */
export function useIsSlow(loading: boolean): boolean {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!loading) return;
    const timer = setTimeout(() => setSlow(true), SLOW_AFTER_MS);
    return () => {
      clearTimeout(timer);
      setSlow(false);
    };
  }, [loading]);
  return loading && slow;
}
