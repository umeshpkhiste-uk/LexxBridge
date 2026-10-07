import * as ExpoCrypto from "expo-crypto";
import "react-native-get-random-values";

/** React Native (Hermes) has no WebCrypto API. `react-native-get-random-values`
 * (imported above) gives `global.crypto` a bare `getRandomValues`, but no
 * `.subtle` — and Supabase's PKCE code-challenge generation
 * (`generatePKCEChallenge` in `@supabase/auth-js`, used by every auth call
 * that sets a `redirectTo`: sign-up, password reset, OAuth) needs
 * `crypto.subtle.digest` for SHA-256. Without it, auth-js silently falls
 * back to the weaker `plain` PKCE method and logs "WebCrypto API is not
 * supported" — which Expo's LogBox then surfaces as an on-screen warning
 * overlay, on both Expo Go and a real device build.
 *
 * `expo-crypto` (already a dependency, already linked natively — see
 * `src/features/applock/appLock.ts`) exposes a `digest()` with the exact
 * same shape as `SubtleCrypto.digest`, so this patches `crypto.subtle` with
 * it instead of pulling in a separate WebCrypto polyfill package. No-op on
 * web, where the browser already provides the real thing.
 */
function algorithmName(algorithm: AlgorithmIdentifier): string {
  return typeof algorithm === "string" ? algorithm : algorithm.name;
}

if (typeof globalThis.crypto !== "object" || globalThis.crypto === null) {
  // @ts-expect-error — building the polyfill object itself
  globalThis.crypto = {};
}

if (typeof globalThis.crypto.subtle === "undefined") {
  // @ts-expect-error — only `digest` is implemented; that's all auth-js's PKCE code calls
  globalThis.crypto.subtle = {
    digest: (algorithm: AlgorithmIdentifier, data: BufferSource) =>
      ExpoCrypto.digest(algorithmName(algorithm) as ExpoCrypto.CryptoDigestAlgorithm, data),
  };
}
