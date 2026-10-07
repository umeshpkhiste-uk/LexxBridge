import { zodResolver } from "@hookform/resolvers/zod";
import { router } from "expo-router";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { Text } from "react-native";
import { requestPasswordReset } from "@/features/auth/api";
import { ForgotPasswordValues, forgotPasswordSchema } from "@/features/auth/schemas";
import { Button } from "@/shared/ui/Button";
import { ScreenContainer } from "@/shared/ui/ScreenContainer";
import { TextField } from "@/shared/ui/TextField";
import { useTheme } from "@/shared/ui/theme";

export default function ForgotPasswordScreen() {
  const { colors, spacing, typography } = useTheme();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotPasswordValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: "" },
  });

  /** Always shows the same neutral result, whether or not the email has an
   * account — Supabase's resetPasswordForEmail is deliberately built not to
   * reveal that distinction (it returns success either way), so surfacing
   * its error here would both contradict that and let a password-reset
   * attempt be used to find out which emails are registered. A genuine send
   * failure (rate limit, SMTP outage) still reaches this same message; it's
   * visible in Supabase's own Auth logs if it needs investigating. */
  const onSubmit = async (values: ForgotPasswordValues) => {
    setIsSubmitting(true);
    await requestPasswordReset(values.email);
    setIsSubmitting(false);
    setSent(true);
  };

  return (
    <ScreenContainer scroll>
      <Text style={[typography.title, { color: colors.textPrimary, marginBottom: spacing.xs }]}>
        Reset your password
      </Text>
      <Text style={[typography.body, { color: colors.textSecondary, marginBottom: spacing.lg }]}>
        Enter your account email and we&apos;ll send you a reset link.
      </Text>

      <Controller
        control={control}
        name="email"
        render={({ field }) => (
          <TextField
            label="Email"
            placeholder="you@example.com"
            autoCapitalize="none"
            keyboardType="email-address"
            value={field.value}
            onChangeText={field.onChange}
            error={errors.email?.message}
          />
        )}
      />

      {sent ? (
        <Text style={[typography.caption, { color: colors.success, marginBottom: spacing.md }]}>
          If that email has an account, a reset link is on its way.
        </Text>
      ) : null}

      <Button label="Send reset link" onPress={handleSubmit(onSubmit)} loading={isSubmitting} />

      <Button label="Back to sign in" variant="ghost" onPress={() => router.back()} />
    </ScreenContainer>
  );
}
