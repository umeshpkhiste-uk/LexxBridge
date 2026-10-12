import * as FileSystem from "expo-file-system/legacy";
import { Platform } from "react-native";

/**
 * Reads a local file (picked via expo-image-picker / expo-document-picker)
 * as base64. `expo-file-system`'s `readAsStringAsync` has no web
 * implementation — calling it there throws "is not available on web" — so
 * on web this fetches the blob: URI and reads it through FileReader
 * instead; on native it's the normal FileSystem read.
 */
export async function fileUriToBase64(uri: string): Promise<string> {
  if (Platform.OS === "web") {
    const res = await fetch(uri);
    const blob = await res.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        // "data:<mime>;base64,<data>" — only the part after the comma is needed.
        resolve(result.slice(result.indexOf(",") + 1));
      };
      reader.onerror = () => reject(reader.error ?? new Error("Couldn't read file"));
      reader.readAsDataURL(blob);
    });
  }
  return FileSystem.readAsStringAsync(uri, { encoding: "base64" });
}
