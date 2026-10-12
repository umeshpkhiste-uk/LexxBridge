import { Ionicons } from "@expo/vector-icons";
import { Link, useLocalSearchParams } from "expo-router";
import { Text, View } from "react-native";
import { BiometricLoginButton } from "@/features/biometric/BiometricLoginButton";
import { SignInForm } from "@/features/auth/SignInForm";
import { ScreenContainer } from "@/shared/ui/ScreenContainer";
import { AppLogo } from "@/shared/ui/AppLogo";
import { useTheme } from "@/shared/ui/theme";

export default function SignInScreen() {
  const { colors, spacing, radius, typography } = useTheme();
  const { justSignedUp } = useLocalSearchParams<{ justSignedUp?: string }>();

  return (
    <ScreenContainer scroll>
      <View style={{ alignItems: "center", marginTop: spacing.md, marginBottom: spacing.lg }}>
        <AppLogo size={88} />
      </View>
      <Text style={[typography.display, { color: colors.textPrimary, marginBottom: spacing.xs, textAlign: "center" }]}>
        Log in
      </Text>
      <Text style={[typography.body, { color: colors.textSecondary, marginBottom: spacing.xl, textAlign: "center" }]}>
        Login to access your LexxBridge account.
      </Text>

      {justSignedUp ? (
        <View
          style={{
            flexDirection: "row",
            alignItems: "flex-start",
            gap: spacing.sm,
            backgroundColor: colors.surfaceAlt,
            borderRadius: radius.lg,
            padding: spacing.md,
            marginBottom: spacing.lg,
          }}
        >
          <Ionicons name="mail-outline" size={20} color={colors.brand} />
          <Text style={[typography.caption, { color: colors.textPrimary, flex: 1 }]}>
            Account created. We sent a confirmation link to your email — verify it, then sign in below.
          </Text>
        </View>
      ) : null}

      <SignInForm />
      <View style={{ height: spacing.md }} />
      <BiometricLoginButton />

      <View style={{ height: spacing.lg }} />
      <Link href="/(auth)/sign-up">
        <Text style={[typography.caption, { color: colors.textSecondary, textAlign: "center" }]}>
          Don&apos;t have an account? <Text style={{ color: colors.accent, fontWeight: "600" }}>Sign Up</Text>
        </Text>
      </Link>
    </ScreenContainer>
  );
}
