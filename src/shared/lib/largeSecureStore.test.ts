import AsyncStorage from "@react-native-async-storage/async-storage";
import { LargeSecureStore } from "./largeSecureStore";

jest.mock("@react-native-async-storage/async-storage", () => {
  const store = new Map<string, string>();
  return {
    getItem: jest.fn((k: string) => Promise.resolve(store.get(k) ?? null)),
    setItem: jest.fn((k: string, v: string) => {
      store.set(k, v);
      return Promise.resolve();
    }),
    removeItem: jest.fn((k: string) => {
      store.delete(k);
      return Promise.resolve();
    }),
  };
});

jest.mock("expo-secure-store", () => {
  const store = new Map<string, string>();
  return {
    getItemAsync: jest.fn((k: string) => Promise.resolve(store.get(k) ?? null)),
    setItemAsync: jest.fn((k: string, v: string) => {
      store.set(k, v);
      return Promise.resolve();
    }),
    deleteItemAsync: jest.fn((k: string) => {
      store.delete(k);
      return Promise.resolve();
    }),
  };
});

describe("LargeSecureStore", () => {
  it("round-trips a value through encryption", async () => {
    const store = new LargeSecureStore();
    await store.setItem("session", JSON.stringify({ access_token: "abc", refresh_token: "xyz" }));
    const result = await store.getItem("session");
    expect(result).toBe(JSON.stringify({ access_token: "abc", refresh_token: "xyz" }));
  });

  it("returns null for a key that was never written", async () => {
    const store = new LargeSecureStore();
    expect(await store.getItem("never-written")).toBeNull();
  });

  it("removeItem clears both the value and its encryption key", async () => {
    const store = new LargeSecureStore();
    await store.setItem("session", "secret");
    await store.removeItem("session");
    expect(await store.getItem("session")).toBeNull();
  });

  // The actual security-relevant behavior: two writes of the SAME plaintext
  // under the SAME key must never produce the same keystream. A fixed
  // counter (the bug this test guards against) makes AES-CTR ciphertext
  // fully determined by (key, counter, plaintext) — identical plaintext
  // would then always produce byte-identical stored ciphertext, and two
  // different plaintexts under that reused keystream could be XORed
  // together to recover both. A random counter per write breaks that.
  it("never reuses the same counter across writes, even for identical plaintext", async () => {
    const store = new LargeSecureStore();
    await store.setItem("session", "same-value");
    const first = await AsyncStorage.getItem("session");
    await store.setItem("session", "same-value");
    const second = await AsyncStorage.getItem("session");

    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    // Different stored bytes despite identical plaintext...
    expect(first).not.toBe(second);
    // ...specifically because the leading counter prefix differs.
    const COUNTER_HEX_LENGTH = 32;
    expect(first!.slice(0, COUNTER_HEX_LENGTH)).not.toBe(second!.slice(0, COUNTER_HEX_LENGTH));

    // Both still decrypt back to the original plaintext.
    expect(await store.getItem("session")).toBe("same-value");
  });
});
