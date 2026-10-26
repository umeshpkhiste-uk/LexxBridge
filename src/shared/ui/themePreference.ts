import AsyncStorage from "@react-native-async-storage/async-storage";
import { Appearance, Platform } from "react-native";

export type ThemePreference = "system" | "light" | "dark";

const STORAGE_KEY = "theme.preference";

export const themePreferenceLabel: Record<ThemePreference, string> = {
  system: "System default",
  light: "Light",
  dark: "Dark",
};

/** Overrides the OS colour scheme app-wide, so every `useColorScheme()`
 * (and therefore `useTheme()`) follows the advocate's choice. */
function apply(preference: ThemePreference) {
  // Not available on web; manual light/dark override has no effect there,
  // useTheme() just follows the browser's prefers-color-scheme.
  if (Platform.OS === "web") return;
  Appearance.setColorScheme(preference === "system" ? "unspecified" : preference);
}

export async function getThemePreference(): Promise<ThemePreference> {
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    return stored === "light" || stored === "dark" ? stored : "system";
  } catch {
    return "system";
  }
}

export async function setThemePreference(preference: ThemePreference): Promise<void> {
  apply(preference);
  try {
    await AsyncStorage.setItem(STORAGE_KEY, preference);
  } catch {
    // Non-critical: the choice still applies for this session.
  }
}

/** Call once at startup to restore the saved choice. */
export async function restoreThemePreference(): Promise<void> {
  apply(await getThemePreference());
}
