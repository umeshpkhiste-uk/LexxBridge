import "react-native-url-polyfill/auto";
import "./webCryptoPolyfill";
import { createClient } from "@supabase/supabase-js";
import { AppState, Platform } from "react-native";
import { LargeSecureStore } from "./largeSecureStore";

// expo-secure-store has no server-side/web implementation, so the encrypted
// keychain-backed adapter is native-only. Phase 1 targets Android/iOS
// (spec §3); web support is a later phase and will need its own storage
// strategy (Supabase's own localStorage-backed default is fine there, since
// browser storage is already the standard for web session persistence).
const authStorage = Platform.OS === "web" ? undefined : new LargeSecureStore();

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY. " +
      "Copy .env.example to .env and fill in your Supabase project credentials. " +
      "See docs/BACKEND_SETUP.md for the full setup steps."
  );
}

// A freshly issued access token (right after sign-in or a refresh) can be
// rejected by PostgREST with PGRST303 "JWT issued at future" when its clock
// is a moment behind the auth server's. It clears within a second or two, so
// retry those requests briefly instead of failing the whole screen.
const JWT_SKEW_RETRIES = 3;
const JWT_SKEW_DELAY_MS = 1000;

// A stalled connection (weak signal, congested wifi) otherwise leaves a
// fetch promise pending forever — no error, no retry, just a spinner that
// never resolves. Storage requests (attachment upload/download) get a
// longer allowance since a multi-MB file can legitimately take a while.
const API_TIMEOUT_MS = 20_000;
const STORAGE_TIMEOUT_MS = 60_000;

function withTimeout(promise: Promise<Response>, ms: number): Promise<Response> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("The request timed out. Check your connection and try again.")),
      ms
    );
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

async function fetchWithJwtSkewRetry(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const timeoutMs = url.includes("/storage/v1/") ? STORAGE_TIMEOUT_MS : API_TIMEOUT_MS;

  for (let attempt = 0; ; attempt++) {
    const response = await withTimeout(fetch(input, init), timeoutMs);
    if (response.status !== 401 || attempt >= JWT_SKEW_RETRIES) return response;

    const body = await response.clone().text();
    if (!body.includes("JWT issued at future")) return response;

    await new Promise((resolve) => setTimeout(resolve, JWT_SKEW_DELAY_MS));
  }
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: { fetch: fetchWithJwtSkewRetry },
  auth: {
    storage: authStorage,
    autoRefreshToken: true,
    persistSession: true,
    // detectSessionInUrl is a browser-only feature (it reads window.location).
    // On native we instead exchange the auth code ourselves from the deep
    // link URL — see src/shared/lib/authDeepLink.ts.
    detectSessionInUrl: false,
    // PKCE (not the older implicit/hash flow) is what lets us pull a single
    // `code` query param out of the deep link and exchange it for a session
    // via exchangeCodeForSession, which is what authDeepLink.ts does.
    flowType: "pkce",
  },
});

// Supabase's token auto-refresh needs to be told when the app is foregrounded/backgrounded,
// otherwise sessions can silently expire while the app is suspended.
AppState.addEventListener("change", (state) => {
  if (state === "active") {
    supabase.auth.startAutoRefresh();
  } else {
    supabase.auth.stopAutoRefresh();
  }
});
