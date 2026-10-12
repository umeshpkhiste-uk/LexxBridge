import { zodResolver } from "@hookform/resolvers/zod";
import { Link } from "expo-router";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { Text, View } from "react-native";
import { Button } from "@/shared/ui/Button";
import { TextField } from "@/shared/ui/TextField";
import { useTheme } from "@/shared/ui/theme";
import { signInWithEmail } from "./api";
import { SignInValues, signInSchema } from "./schemas";

/**
 * Email + password sign-in: the fields, "Forgot Password?" link, and Sign
 * In button, with no surrounding layout of its own. Embedded directly on
 * the welcome screen and reused as-is on the dedicated sign-in screen, so
 * both stay in sync.
 */
export function SignInForm() {
  const { colors, spacing, typography } = useTheme();
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
    <View>
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
        <Text style={[typography.caption, { color: colors.accent, fontWeight: "600" }]}>Forgot Password?</Text>
      </Link>

      {submitError ? (
        <Text style={[typography.caption, { color: colors.danger, marginBottom: spacing.md }]}>{submitError}</Text>
      ) : null}

      <Button label="Sign In" onPress={handleSubmit(onSubmit)} loading={isSubmitting} pill />
    </View>
  );
}
