import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { Text, View } from "react-native";
import { Button } from "@/shared/ui/Button";
import { ScreenContainer } from "@/shared/ui/ScreenContainer";
import { useTheme } from "@/shared/ui/theme";

export default function VerifyEmailScreen() {
  const { colors, spacing, typography } = useTheme();

  return (
    <ScreenContainer style={{ justifyContent: "center", alignItems: "center" }}>
      <Ionicons name="mail-outline" size={48} color={colors.brand} style={{ marginBottom: spacing.lg }} />
      <Text style={[typography.title, { color: colors.textPrimary, textAlign: "center" }]}>
        Check your email
      </Text>
      <Text
        style={[
          typography.body,
          { color: colors.textSecondary, textAlign: "center", marginTop: spacing.sm, marginBottom: spacing.xl },
        ]}
      >
        We sent a confirmation link to your email address. Verify it, then sign in to continue.
      </Text>
      <View style={{ alignSelf: "stretch" }}>
        <Button label="Go to sign in" onPress={() => router.replace("/(auth)")} />
      </View>
    </ScreenContainer>
  );
}
