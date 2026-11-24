import * as SecureStore from "expo-secure-store";
import { supabase } from "@/shared/lib/supabase";
import { NETWORK_ERROR_MESSAGE } from "@/shared/lib/errors";
import { loginWithBiometric, loginWithSavedSession } from "./biometric";

jest.mock("expo-secure-store", () => {
  const store = new Map<string, string>();
  return {
    getItemAsync: jest.fn(async (k: string) => store.get(k) ?? null),
    setItemAsync: jest.fn(async (k: string, v: string) => void store.set(k, v)),
    deleteItemAsync: jest.fn(async (k: string) => void store.delete(k)),
  };
});
jest.mock("expo-local-authentication", () => ({ authenticateAsync: jest.fn(async () => ({ success: true })) }));
jest.mock("@/shared/lib/supabase", () => ({ supabase: { auth: { refreshSession: jest.fn() } } }));
jest.mock("@/features/applock/appLock", () => ({}));
jest.mock("@/features/notifications/device", () => ({}));

const refresh = supabase.auth.refreshSession as jest.Mock;
const savedToken = () => SecureStore.getItemAsync("biometric.refreshToken");

describe.each([
  ["Face ID login", () => loginWithBiometric("Face ID")],
  ["PIN / pattern login", () => loginWithSavedSession()],
])("%s", (_name, login) => {
  beforeEach(async () => {
    await SecureStore.setItemAsync("biometric.refreshToken", "token");
    await SecureStore.setItemAsync("quicklogin.savedAt", String(Date.now()));
  });

  it("keeps the saved login when the network fails", async () => {
    refresh.mockResolvedValue({ error: { name: "AuthRetryableFetchError", message: "Failed to fetch" } });
    expect((await login()).error).toBe(NETWORK_ERROR_MESSAGE);
    expect(await savedToken()).toBe("token");
  });

  it("drops the saved login when the server rejects it", async () => {
    refresh.mockResolvedValue({ error: { message: "Invalid Refresh Token", code: "refresh_token_not_found" } });
    expect((await login()).error).toMatch(/has expired/);
    expect(await savedToken()).toBeNull();
  });

  it("drops the single-use token after a successful login", async () => {
    refresh.mockResolvedValue({ error: null });
    expect((await login()).error).toBeNull();
    expect(await savedToken()).toBeNull();
  });
});
