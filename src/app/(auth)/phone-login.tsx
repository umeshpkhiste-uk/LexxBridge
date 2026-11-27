import { router } from "expo-router";
import { Text } from "react-native";
import { sendLoginCode, verifyLoginCode } from "@/features/auth/phone";
import { PhoneCodeForm } from "@/features/auth/PhoneCodeForm";
import { Button } from "@/shared/ui/Button";
import { ScreenContainer } from "@/shared/ui/ScreenContainer";
import { useTheme } from "@/shared/ui/theme";

/** Sign in with a code texted to a number verified in Settings. On success
 * AuthProvider sees the session and the root navigator opens the app. */
export default function PhoneLoginScreen() {
  const { colors, spacing, typography } = useTheme();
  return (
    <ScreenContainer scroll>
      <Text style={[typography.title, { color: colors.textPrimary, marginBottom: spacing.xs }]}>Sign in with your mobile</Text>
      <Text style={[typography.body, { color: colors.textSecondary, marginBottom: spacing.lg }]}>
        Use the number you verified in Settings → Security → Mobile number login. We&apos;ll text you a code.
      </Text>
      <PhoneCodeForm
        onSend={sendLoginCode}
        onVerify={verifyLoginCode}
        // Neutral on purpose: never says whether the number is registered.
        sentText={(phone) => `If ${phone} is verified on an account, a code is on its way.`}
        verifyLabel="Sign in"
      />
      <Button label="Back to sign in" variant="ghost" onPress={() => (router.canGoBack() ? router.back() : router.replace("/(auth)"))} />
    </ScreenContainer>
  );
}
