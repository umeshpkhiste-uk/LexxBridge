import { Ionicons } from "@expo/vector-icons";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link, router } from "expo-router";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { Pressable, Text, View } from "react-native";
import { signUpWithEmail } from "@/features/auth/api";
import { SignUpValues, signUpSchema } from "@/features/auth/schemas";
import { AppLogo } from "@/shared/ui/AppLogo";
import { Button } from "@/shared/ui/Button";
import { ScreenContainer } from "@/shared/ui/ScreenContainer";
import { TextField } from "@/shared/ui/TextField";
import { useTheme } from "@/shared/ui/theme";

export default function SignUpScreen() {
  const { colors, spacing, typography } = useTheme();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Pre-checked, matching the design — most people don't object to the
  // terms, and unchecking is still one tap away before submitting.
  const [agreedToTerms, setAgreedToTerms] = useState(true);

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<SignUpValues>({
    resolver: zodResolver(signUpSchema),
    defaultValues: { fullName: "", email: "", password: "" },
  });

  const onSubmit = async (values: SignUpValues) => {
    setSubmitError(null);
    setIsSubmitting(true);
    const { error } = await signUpWithEmail(values);
    setIsSubmitting(false);

    if (error) {
      setSubmitError(error);
      return;
    }

    // Email confirmation is required before sign-in works (see
    // docs/AUTH.md) — the confirmation link itself still opens
    // (auth)/verify-email, which exchanges it for a session automatically.
    // This screen is only the very next step right after submitting the
    // form, so it lands back on the welcome screen with a reminder, rather
    // than a separate "check your email" screen.
    router.replace({ pathname: "/(auth)", params: { justSignedUp: "1" } });
  };

  return (
    <ScreenContainer scroll>
      {/* Hero: logo, app name, and what it offers — same treatment as the
          onboarding intro, shown once above the form. */}
      <View style={{ alignItems: "center", marginTop: spacing.lg, marginBottom: spacing.xl }}>
        <AppLogo size={96} />
        <Text style={[typography.title, { color: colors.textPrimary, marginTop: spacing.md }]}>LexxBridge</Text>
        <Text
          style={[
            typography.body,
            { color: colors.textSecondary, textAlign: "center", marginTop: spacing.xs, paddingHorizontal: spacing.lg },
          ]}
        >
          Create an account to start your practice journey
        </Text>
      </View>

      <Controller
        control={control}
        name="fullName"
        render={({ field }) => (
          <TextField
            label="Full name"
            placeholder="e.g. Rahul Sharma"
            autoCapitalize="words"
            value={field.value}
            onChangeText={field.onChange}
            error={errors.fullName?.message}
          />
        )}
      />
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
            placeholder="Create a password"
            secureTextEntry
            autoComplete="new-password"
            value={field.value}
            onChangeText={field.onChange}
            error={errors.password?.message}
          />
        )}
      />

      <Pressable
        onPress={() => setAgreedToTerms((v) => !v)}
        hitSlop={8}
        style={{ flexDirection: "row", alignItems: "center", marginBottom: spacing.lg }}
      >
        <Ionicons
          name={agreedToTerms ? "checkbox" : "square-outline"}
          size={22}
          color={agreedToTerms ? colors.brand : colors.textSecondary}
          style={{ marginRight: spacing.sm }}
        />
        <Text style={[typography.caption, { color: colors.textSecondary, flex: 1 }]}>
          Agree with{" "}
          <Link href="/legal/terms">
            <Text style={{ color: colors.accent, fontWeight: "600" }}>Terms & Condition</Text>
          </Link>{" "}
          and{" "}
          <Link href="/legal/privacy">
            <Text style={{ color: colors.accent, fontWeight: "600" }}>Privacy Policy</Text>
          </Link>
        </Text>
      </Pressable>

      {submitError ? (
        <Text style={[typography.caption, { color: colors.danger, marginBottom: spacing.md }]}>{submitError}</Text>
      ) : null}

      <Button label="Sign Up" onPress={handleSubmit(onSubmit)} loading={isSubmitting} disabled={!agreedToTerms} pill />

      <View style={{ height: spacing.lg }} />
      <Link href="/(auth)">
        <Text style={[typography.caption, { color: colors.textSecondary, textAlign: "center" }]}>
          Already have an account? <Text style={{ color: colors.brand, fontWeight: "600" }}>Sign In</Text>
        </Text>
      </Link>
    </ScreenContainer>
  );
}
