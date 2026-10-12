import { Ionicons } from "@expo/vector-icons";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { Text, View } from "react-native";
import { BiometricLoginButton } from "@/features/biometric/BiometricLoginButton";
import { signInWithEmail } from "@/features/auth/api";
import { SignInValues, signInSchema } from "@/features/auth/schemas";
import { Button } from "@/shared/ui/Button";
import { ScreenContainer } from "@/shared/ui/ScreenContainer";
import { TextField } from "@/shared/ui/TextField";
import { AppLogo } from "@/shared/ui/AppLogo";
import { useTheme } from "@/shared/ui/theme";

export default function SignInScreen() {
  const { colors, spacing, radius, typography } = useTheme();
  const { justSignedUp } = useLocalSearchParams<{ justSignedUp?: string }>();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<SignInValues>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = async (values: SignInValues) => {
    setSubmitError(null);
    setIsSubmitting(true);
    const { error } = await signInWithEmail(values);
    setIsSubmitting(false);
    // On success, AuthProvider's onAuthStateChange updates the session and
    // the root navigator's Stack.Protected guard switches to the (app) group.
    if (error) setSubmitError(error);
  };

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

      <Controller
        control={control}
        name="email"
        render={({ field }) => (
          <TextField
            label="Email"
            placeholder="you@example.com"
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
            value={field.value}
            onChangeText={field.onChange}
            error={errors.email?.message}
          />
        )}
      />
      <Controller
        control={control}
        name="password"
        render={({ field }) => (
          <TextField
            label="Password"
            placeholder="Your password"
            secureTextEntry
            autoComplete="password"
            value={field.value}
            onChangeText={field.onChange}
            error={errors.password?.message}
          />
        )}
      />

      <Link href="/(auth)/forgot-password" style={{ alignSelf: "flex-end", marginBottom: spacing.lg }}>
        <Text style={[typography.caption, { color: colors.accent, fontWeight: "600" }]}>
          Forgot Password?
        </Text>
      </Link>

      {submitError ? (
        <Text style={[typography.caption, { color: colors.danger, marginBottom: spacing.md }]}>
          {submitError}
        </Text>
      ) : null}

      <Button label="Sign In" onPress={handleSubmit(onSubmit)} loading={isSubmitting} pill />
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
