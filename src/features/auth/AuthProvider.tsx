import type { Session } from "@supabase/supabase-js";
import * as Linking from "expo-linking";
import { createContext, PropsWithChildren, useContext, useEffect, useState } from "react";
import { AppState } from "react-native";
import { ensureConsentRecorded } from "@/features/legal/consent";
import { consumeAuthDeepLink } from "@/shared/lib/authDeepLink";
import { supabase } from "@/shared/lib/supabase";

type AuthContextValue = {
  session: Session | null;
  isLoading: boolean;
  /** True once a password-recovery deep link has been consumed, until the
   * user finishes setting a new password. A recovery link does establish a
   * real session (that's how Supabase lets updateUser() work), so this flag
   * is what keeps the app on the "set new password" screen instead of the
   * root navigator treating the user as normally signed in. */
  isPasswordRecovery: boolean;
  clearPasswordRecovery: () => void;
  /** Set when a password-reset or email-confirmation deep link's code
   * failed to exchange for a session (expired, already used, wrong
   * browser) — shown on the sign-in screen so the tap isn't silent. */
  deepLinkError: string | null;
  clearDeepLinkError: () => void;
  /** Whether the signed-in user has accepted the current Terms + Privacy
   * Policy version (DPDP Act §6). "needed" keeps them on the consent screen
   * until they accept or sign out; "checking" while it's being looked up. */
  consentStatus: "checking" | "ok" | "needed";
  markConsented: () => void;
};

/** How often a signed-in device re-checks that its session is still valid. */
const SESSION_CHECK_MS = 60_000;

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false);
  const [deepLinkError, setDeepLinkError] = useState<string | null>(null);
  const [consent, setConsent] = useState<{ userId: string; ok: boolean } | null>(null);

  // Re-checked whenever a different user signs in. Tied to the user id so a
  // stale answer for a previous account is never applied to the next one.
  const userId = session?.user.id ?? null;
  useEffect(() => {
    if (!session) return;
    let active = true;
    ensureConsentRecorded(session.user).then((ok) => {
      if (active) setConsent({ userId: session.user.id, ok });
    });
    return () => {
      active = false;
    };
    // Only re-run for a different user, not every token refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);
  // Sign this device out as soon as its session is revoked elsewhere — a
  // password change (updatePassword revokes every other session) or
  // "sign out other devices". Revoking only stops the refresh token; the
  // access token here would keep working for up to an hour. getUser() asks
  // the auth server, which answers session_not_found for a revoked session,
  // and supabase-js then clears it locally and fires SIGNED_OUT — the
  // listener below sets session to null and the router shows sign-in.
  // Network errors don't sign anyone out, so being offline is safe.
  useEffect(() => {
    if (!userId) return;
    const verify = () => {
      supabase.auth.getUser().catch(() => {});
    };
    const timer = setInterval(verify, SESSION_CHECK_MS);
    const appState = AppState.addEventListener("change", (state) => {
      if (state === "active") verify();
    });
    return () => {
      clearInterval(timer);
      appState.remove();
    };
  }, [userId]);

  const consentStatus = !userId || consent?.userId !== userId ? "checking" : consent.ok ? "ok" : "needed";

  useEffect(() => {
    let active = true;
    const { data: authSubscription } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (event === "PASSWORD_RECOVERY") setIsPasswordRecovery(true);
      setSession(nextSession);
    });

    // Cold start: the app may have been opened directly from an email link.
    // Stay "loading" until that link's code has been exchanged — otherwise
    // the navigator renders first, sees /reset-password still locked (no
    // recovery yet) and redirects away, then the recovery flag flips a
    // moment later and the router falls back to whatever public route is
    // left (it landed on /legal/terms).
    (async () => {
      const linkError = await Linking.getInitialURL()
        .then(consumeAuthDeepLink)
        .catch(() => null);
      const { data } = await supabase.auth.getSession();
      if (!active) return;
      setDeepLinkError(linkError);
      setSession(data.session);
      setIsLoading(false);
    })();
    // Warm start: the app was already open (backgrounded) when the link was tapped.
    const linkingSubscription = Linking.addEventListener("url", ({ url }) => consumeAuthDeepLink(url).then(setDeepLinkError));

    return () => {
      active = false;
      authSubscription.subscription.unsubscribe();
      linkingSubscription.remove();
    };
  }, []);

  return (
    <AuthContext.Provider
      value={{
        session,
        isLoading,
        isPasswordRecovery,
        clearPasswordRecovery: () => setIsPasswordRecovery(false),
        deepLinkError,
        clearDeepLinkError: () => setDeepLinkError(null),
        consentStatus,
        markConsented: () => userId && setConsent({ userId, ok: true }),
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
