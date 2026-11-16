import { Ionicons } from "@expo/vector-icons";
import * as WebBrowser from "expo-web-browser";
import { useEffect, useState } from "react";
import { Platform, Pressable, Text, View } from "react-native";
import { signOut } from "@/features/auth/api";
import { useAuth } from "@/features/auth/AuthProvider";
import { CURRENT_POLICY_VERSION, recordConsent } from "@/features/legal/consent";
import { supabase } from "@/shared/lib/supabase";
import { Button } from "@/shared/ui/Button";
import { ScreenContainer } from "@/shared/ui/ScreenContainer";
import { useTheme } from "@/shared/ui/theme";

/** Shown after sign-in whenever the user hasn't accepted the current Terms
 * + Privacy Policy version: accounts made with Google/Apple (which skip the
 * sign-up form), accounts created before consent was recorded, and everyone
 * again after a policy update (DPDP Act §5–6). Both boxes start unticked —
 * consent has to be a clear affirmative action. Declining signs out.
 *
 * Rendered by the root layout in place of the navigator (like the app-lock
 * screen), not as a route: as a protected route, Expo Router's fallback
 * kept bouncing to /legal/terms. So the documents open in a browser tab /
 * in-app browser sheet instead of being pushed onto a stack. */
export function ConsentScreen() {
  const { colors, spacing, radius, typography } = useTheme();
  const { session, markConsented } = useAuth();
  const [isAdult, setIsAdult] = useState(false);
  const [agrees, setAgrees] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Accepted an earlier version before → word this as a policy update.
  const [isUpdate, setIsUpdate] = useState(false);

  const userId = session?.user.id;
  useEffect(() => {
    if (!userId) return;
    supabase
      .from("user_consents")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .neq("policy_version", CURRENT_POLICY_VERSION)
      .then(({ count }) => setIsUpdate(!!count));
  }, [userId]);

  const accept = async () => {
    if (!userId) return;
    setError(null);
    setIsSaving(true);
    const { error: saveError } = await recordConsent(userId, "prompt");
    setIsSaving(false);
    if (saveError) {
      setError("Couldn't save your consent. Please check your connection and try again.");
      return;
    }
    markConsented();
  };

  const checkbox = (checked: boolean, onToggle: () => void, label: React.ReactNode) => (
    <Pressable onPress={onToggle} hitSlop={8} accessibilityRole="checkbox" accessibilityState={{ checked }} style={{ flexDirection: "row", alignItems: "flex-start", gap: spacing.sm }}>
      <Ionicons name={checked ? "checkbox" : "square-outline"} size={22} color={checked ? colors.brand : colors.textSecondary} />
      <Text style={[typography.body, { color: colors.textPrimary, flex: 1 }]}>{label}</Text>
    </Pressable>
  );

  const link = (path: "/legal/terms" | "/legal/privacy", label: string) => (
    <Text
      style={{ color: colors.accent, fontWeight: "600" }}
      accessibilityRole="link"
      onPress={() => {
        if (Platform.OS === "web") window.open(path, "_blank", "noopener");
        else WebBrowser.openBrowserAsync(`https://lexxbridge.app${path}`);
      }}
    >
      {label}
    </Text>
  );

  return (
    <ScreenContainer scroll>
      <View style={{ gap: spacing.md, marginTop: spacing.xl }}>
        <Ionicons name="shield-checkmark-outline" size={40} color={colors.brand} />
        <Text style={[typography.title, { color: colors.textPrimary }]}>
          {isUpdate ? "We've updated our Terms and Privacy Policy" : "Before you continue"}
        </Text>
        <Text style={[typography.body, { color: colors.textSecondary }]}>
          {isUpdate
            ? "Please review the updated documents and confirm to keep using LexxBridge."
            : "Please review how LexxBridge uses your personal data and confirm to continue."}
        </Text>

        <View style={{ backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: spacing.md, gap: spacing.sm }}>
          {[
            "We use your profile, practice records and messages only to run LexxBridge for you — never for ads, and we never sell your data.",
            "Your clients, cases, documents and payments are private to your account. Messages are end-to-end encrypted.",
            "You can export your data, correct it, or delete your account at any time from Settings.",
            "For any concern, contact our Grievance Officer (details in the Privacy Policy). You may also complain to the Data Protection Board of India.",
          ].map((point) => (
            <View key={point} style={{ flexDirection: "row", gap: spacing.sm }}>
              <Ionicons name="checkmark-circle-outline" size={18} color={colors.brand} style={{ marginTop: 2 }} />
              <Text style={[typography.caption, { color: colors.textPrimary, flex: 1 }]}>{point}</Text>
            </View>
          ))}
        </View>

        {checkbox(isAdult, () => setIsAdult((v) => !v), "I confirm I am 18 years of age or older.")}
        {checkbox(
          agrees,
          () => setAgrees((v) => !v),
          <>
            I have read and agree to the {link("/legal/terms", "Terms & Conditions")} and {link("/legal/privacy", "Privacy Policy")}.
          </>,
        )}

        {error ? <Text style={[typography.caption, { color: colors.danger }]}>{error}</Text> : null}

        <Button label="Agree and continue" onPress={accept} loading={isSaving} disabled={!isAdult || !agrees} pill />
        <Button label="Decline and sign out" variant="secondary" onPress={() => signOut()} pill />
      </View>
    </ScreenContainer>
  );
}
