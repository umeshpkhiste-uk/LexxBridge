import "react-native-get-random-values";
import { scryptAsync } from "@noble/hashes/scrypt.js";
import { decode as decodeBase64, encode as encodeBase64 } from "base64-arraybuffer";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import nacl from "tweetnacl";
import { supabase } from "@/shared/lib/supabase";

const SECRET_KEY_STORE_KEY = "messaging-secret-key-v1";

// expo-secure-store has no web implementation at all (its web module is an
// empty object), so every call would throw there — same reason supabase.ts
// swaps in a different storage adapter for web. localStorage isn't
// OS-keychain-backed, but the key still never leaves the device, which is
// what actually matters for this protocol.
async function getStoredSecretKey(): Promise<string | null> {
  if (Platform.OS === "web") {
    try {
      return window.localStorage.getItem(SECRET_KEY_STORE_KEY);
    } catch {
      return null;
    }
  }
  return SecureStore.getItemAsync(SECRET_KEY_STORE_KEY);
}

async function storeSecretKey(value: string): Promise<void> {
  if (Platform.OS === "web") {
    window.localStorage.setItem(SECRET_KEY_STORE_KEY, value);
    return;
  }
  await SecureStore.setItemAsync(SECRET_KEY_STORE_KEY, value);
}

let cachedKeyPair: nacl.BoxKeyPair | null = null;
const publicKeyCache = new Map<string, string | null>();

function toBase64(bytes: Uint8Array): string {
  return encodeBase64(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
}

function fromBase64(value: string): Uint8Array {
  return new Uint8Array(decodeBase64(value));
}

/**
 * This device's Curve25519 key pair for messaging. The secret key is
 * generated on-device and stored only in the OS keychain/keystore
 * (expo-secure-store) — it is never sent anywhere. The public half is
 * uploaded to the advocate's profile so others can encrypt to them.
 *
 * Because the secret key never leaves the device, reinstalling the app or
 * switching devices means a new key pair (and losing the ability to decrypt
 * older messages on that device) — that trade-off is what makes this
 * actually end-to-end: there is no server-side copy to recover from.
 */
export async function ensureKeyPair(): Promise<nacl.BoxKeyPair> {
  if (cachedKeyPair) return cachedKeyPair;

  const stored = await getStoredSecretKey();
  const keyPair = stored ? nacl.box.keyPair.fromSecretKey(fromBase64(stored)) : nacl.box.keyPair();
  if (!stored) await storeSecretKey(toBase64(keyPair.secretKey));
  cachedKeyPair = keyPair;
  await publishPublicKey(keyPair);
  return keyPair;
}

/** Checks whether this device already has a stored key pair, without
 * generating one if it doesn't — used to decide whether a backup needs to
 * be restored before `ensureKeyPair()` would otherwise mint a fresh one. */
export async function hasLocalKey(): Promise<boolean> {
  if (cachedKeyPair) return true;
  return (await getStoredSecretKey()) !== null;
}

async function publishPublicKey(keyPair: nacl.BoxKeyPair): Promise<void> {
  const publicKeyB64 = toBase64(keyPair.publicKey);
  const { data, error } = await supabase.auth.getUser();
  if (!error && data.user) {
    // Best-effort: publish this device's public key so others can message
    // us securely. A failure here just means we retry next launch.
    supabase.from("advocate_profiles").update({ messaging_public_key: publicKeyB64 }).eq("id", data.user.id).then(() => {}, () => {});
  }
}

/** The other party's public key, cached for the session once found. A miss
 * is never cached — the other party may publish their key (by opening the
 * app) at any moment, and a cached miss would otherwise make every retry
 * (including the automatic reconnect retry) keep failing until reload. */
export async function getPublicKey(userId: string): Promise<string | null> {
  if (publicKeyCache.has(userId)) return publicKeyCache.get(userId) ?? null;
  const { data, error } = await supabase.from("public_advocate_profiles").select("messaging_public_key").eq("id", userId).maybeSingle();
  const key = error ? null : (data?.messaging_public_key ?? null);
  if (key) publicKeyCache.set(userId, key);
  return key;
}

export type EncryptedPayload = { content: string; nonce: string };

/** Encrypts plaintext for a specific recipient. Throws if the recipient
 * hasn't published a public key yet (they need to open the app once). */
export async function encryptForRecipient(plaintext: string, recipientPublicKeyB64: string): Promise<EncryptedPayload> {
  const keyPair = await ensureKeyPair();
  const nonce = nacl.randomBytes(nacl.box.nonceLength);
  const sealed = nacl.box(new TextEncoder().encode(plaintext), nonce, fromBase64(recipientPublicKeyB64), keyPair.secretKey);
  return { content: toBase64(sealed), nonce: toBase64(nonce) };
}

/**
 * Decrypts a message. Curve25519's Diffie-Hellman shared secret is
 * symmetric — (mySecret, theirPublic) and (theirSecret, myPublic) yield the
 * same key — so this works whether I sent the message or received it; I
 * always decrypt using the OTHER party's public key plus my own secret key.
 */
export async function decryptFromParty(payload: EncryptedPayload, otherPartyPublicKeyB64: string): Promise<string | null> {
  const keyPair = await ensureKeyPair();
  try {
    const opened = nacl.box.open(fromBase64(payload.content), fromBase64(payload.nonce), fromBase64(otherPartyPublicKeyB64), keyPair.secretKey);
    return opened ? new TextDecoder().decode(opened) : null;
  } catch {
    return null;
  }
}

// --- Passphrase-protected key backup -------------------------------------
//
// Reinstalling the app or signing in on a new device otherwise mints a new
// key pair, permanently stranding every message encrypted under the old
// one. To avoid that without weakening end-to-end encryption, the secret
// key can be wrapped with a key derived (via scrypt) from a passphrase the
// user chooses, and the wrapped blob backed up to Supabase. The server only
// ever sees that ciphertext — the passphrase itself never leaves the device
// — so nobody with database access can unwrap it or decrypt messages.

const SCRYPT_OPTS = { N: 2 ** 14, r: 8, p: 1, dkLen: 32 };

async function deriveWrappingKey(passphrase: string, salt: Uint8Array): Promise<Uint8Array> {
  return scryptAsync(passphrase, salt, SCRYPT_OPTS);
}

export type KeyBackupRow = { wrapped_secret_key: string; nonce: string; salt: string };

/** Fetches this user's key backup record, if one exists. `null` means no
 * backup has ever been set up (not a "wrong passphrase" or error state). */
export async function fetchKeyBackup(userId: string): Promise<KeyBackupRow | null> {
  const { data, error } = await supabase.from("messaging_key_backups").select("wrapped_secret_key, nonce, salt").eq("user_id", userId).maybeSingle();
  return error ? null : (data ?? null);
}

/** Wraps this device's current secret key under the given passphrase and
 * upserts it as this user's backup, overwriting any previous one. */
export async function backupKeyPair(userId: string, passphrase: string): Promise<void> {
  const keyPair = await ensureKeyPair();
  const salt = nacl.randomBytes(16);
  const wrappingKey = await deriveWrappingKey(passphrase, salt);
  const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
  const wrapped = nacl.secretbox(keyPair.secretKey, nonce, wrappingKey);
  const { error } = await supabase.from("messaging_key_backups").upsert({
    user_id: userId,
    wrapped_secret_key: toBase64(wrapped),
    nonce: toBase64(nonce),
    salt: toBase64(salt),
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

/** Deletes this user's key backup (e.g. the user turns the feature off). */
export async function deleteKeyBackup(userId: string): Promise<void> {
  await supabase.from("messaging_key_backups").delete().eq("user_id", userId);
}

/**
 * Restores this device's key pair from a backup using the given passphrase.
 * On success, the restored key pair replaces whatever is cached/stored
 * locally and its public key is republished, so future messages route to
 * it again. Returns `false` for a wrong passphrase (never throws for that —
 * a failed unwrap is an expected, retryable outcome, not an error).
 */
export async function restoreKeyPairFromBackup(userId: string, passphrase: string, backup: KeyBackupRow): Promise<boolean> {
  const wrappingKey = await deriveWrappingKey(passphrase, fromBase64(backup.salt));
  const opened = nacl.secretbox.open(fromBase64(backup.wrapped_secret_key), fromBase64(backup.nonce), wrappingKey);
  if (!opened) return false;

  const keyPair = nacl.box.keyPair.fromSecretKey(opened);
  await storeSecretKey(toBase64(keyPair.secretKey));
  cachedKeyPair = keyPair;
  await publishPublicKey(keyPair);
  return true;
}
