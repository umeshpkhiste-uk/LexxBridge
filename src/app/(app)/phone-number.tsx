import { router } from "expo-router";
import { useState } from "react";
import { Text } from "react-native";
import { verifyCurrentPassword } from "@/features/auth/api";
import { useAuth } from "@/features/auth/AuthProvider";
import { sendPhoneVerification, verifyPhoneNumber } from "@/features/auth/phone";
import { PhoneCodeForm } from "@/features/auth/PhoneCodeForm";
import { alertMessage } from "@/shared/lib/alert";
import { NETWORK_ERROR_MESSAGE } from "@/shared/lib/errors";
import { ScreenContainer } from "@/shared/ui/ScreenContainer";
import { TextField } from "@/shared/ui/TextField";
import { useTheme } from "@/shared/ui/theme";

/** Settings → Mobile number login: verify a number by SMS so it can be used
 * to sign in. */
export default function PhoneNumberScreen() {
  const { colors, spacing, typography } = useTheme();
  const { session } = useAuth();
  const [password, setPassword] = useState("");
  const user = session?.user;
  const email = user?.email;
  // A verified number is a way into the account, so adding one asks for the
  // password first. Google / Apple accounts don't have one.
  const needsPassword = !!email && !!user?.app_metadata.providers?.includes("email");

  const send = async (phone: string) => {
    if (needsPassword) {
      if (!password) return { error: "Enter your current password" };
      const { error } = await verifyCurrentPassword(email, password);
      if (error) return { error: error === NETWORK_ERROR_MESSAGE ? error : "That's not your current password." };
    }
    return sendPhoneVerification(phone);
  };

  return (
    <ScreenContainer scroll>
      <Text style={[typography.body, { color: colors.textSecondary, marginBottom: spacing.lg }]}>
        {user?.phone
          ? `+${user.phone} is verified. You can sign in with a code sent to it, or verify a different number below.`
          : "Verify your mobile number to sign in with a code sent by SMS. Your email and password keep working."}
      </Text>
      {needsPassword ? (
        <TextField label="Current password" secureTextEntry autoComplete="password" value={password} onChangeText={setPassword} />
      ) : null}
      <PhoneCodeForm
        onSend={send}
        onVerify={verifyPhoneNumber}
        onVerified={() => {
          alertMessage("Mobile number verified", "You can now sign in with a code sent to this number.");
          router.back();
        }}
        sentText={(phone) => `We sent a code to ${phone}.`}
        verifyLabel="Verify number"
      />
    </ScreenContainer>
  );
}
