import "react-native-get-random-values";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as aesjs from "aes-js";
import * as SecureStore from "expo-secure-store";

// AES-CTR is a stream cipher: encrypting two different values under the same
// (key, counter) pair XORs their keystreams together, which lets anyone
// holding two snapshots of this storage (a device backup, a rooted-device
// dump) cancel the keystream and recover the XOR of the two plaintexts —
// crib-dragging a predictable-structure session blob from there can recover
// the Supabase refresh token. A fixed counter on every write (as this used
// to do) hits that every single time the session is persisted. Each write
// now gets its own random counter, stored as a prefix alongside the
// ciphertext, so no two writes ever share a keystream.
const COUNTER_BYTES = 16;

/**
 * expo-secure-store enforces a ~2048 byte value limit on Android, but Supabase
 * session payloads (access + refresh token + user metadata) routinely exceed that.
 * This is Supabase's documented pattern for Expo: the actual session blob lives in
 * AsyncStorage encrypted with AES-256-CTR, and only the small encryption key lives
 * in the OS keychain/keystore via SecureStore.
 */
export class LargeSecureStore {
  private async getEncryptionKey(keyName: string): Promise<Uint8Array> {
    const existing = await SecureStore.getItemAsync(keyName);
    if (existing) {
      return aesjs.utils.hex.toBytes(existing);
    }
    const newKey = crypto.getRandomValues(new Uint8Array(32));
    await SecureStore.setItemAsync(keyName, aesjs.utils.hex.fromBytes(newKey));
    return newKey;
  }

  async getItem(key: string): Promise<string | null> {
    const stored = await AsyncStorage.getItem(key);
    if (!stored) return null;

    // A value written before this fix carries no counter prefix at all, so
    // there's no reliable way to tell old- and new-format ciphertext apart
    // by content (both are just hex of arbitrary length) — reading an old
    // entry here mis-splits it and decrypts to garbage, which the Supabase
    // client treats as no valid session, prompting one normal re-login.
    // That one-time reset is the expected, acceptable cost of changing the
    // encryption scheme, not a bug to work around.
    const encryptionKey = await this.getEncryptionKey(`${key}-key`);
    const counterHexLength = COUNTER_BYTES * 2;
    const counterBytes = aesjs.utils.hex.toBytes(stored.slice(0, counterHexLength));
    const cipherBytes = aesjs.utils.hex.toBytes(stored.slice(counterHexLength));
    const cipher = new aesjs.ModeOfOperation.ctr(encryptionKey, new aesjs.Counter(counterBytes));
    const decryptedBytes = cipher.decrypt(cipherBytes);
    return aesjs.utils.utf8.fromBytes(decryptedBytes);
  }

  async setItem(key: string, value: string): Promise<void> {
    const encryptionKey = await this.getEncryptionKey(`${key}-key`);
    const counterBytes = crypto.getRandomValues(new Uint8Array(COUNTER_BYTES));
    const cipher = new aesjs.ModeOfOperation.ctr(encryptionKey, new aesjs.Counter(counterBytes));
    const encryptedBytes = cipher.encrypt(aesjs.utils.utf8.toBytes(value));
    await AsyncStorage.setItem(key, aesjs.utils.hex.fromBytes(counterBytes) + aesjs.utils.hex.fromBytes(encryptedBytes));
  }

  async removeItem(key: string): Promise<void> {
    await AsyncStorage.removeItem(key);
    await SecureStore.deleteItemAsync(`${key}-key`);
  }
}
