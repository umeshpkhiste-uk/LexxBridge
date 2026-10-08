import { zodResolver } from "@hookform/resolvers/zod";
import { router } from "expo-router";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { Pressable, Text } from "react-native";
import { z } from "zod";
import { requestPasswordReset, updatePassword, verifyCurrentPassword } from "@/features/auth/api";
import { useAuth } from "@/features/auth/AuthProvider";
import { alertMessage, confirmAlert } from "@/shared/lib/alert";
import { Button } from "@/shared/ui/Button";
import { ScreenContainer } from "@/shared/ui/ScreenContainer";
import { TextField } from "@/shared/ui/TextField";
import { useTheme } from "@/shared/ui/theme";

const schema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password"),
    password: z
      .string()
      .min(8, "Password must be at least 8 characters")
      .regex(/[A-Z]/, "Include at least one uppercase letter")
      .regex(/[0-9]/, "Include at least one number"),
    confirmPassword: z.string(),
  })
  .refine((values) => values.password === values.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  });
type Values = z.infer<typeof schema>;

/** Profile → Change password: change it in-app with the current password,
 * instead of always emailing a reset link. Someone who's forgotten their
 * current password falls back to that email link below the form. */
export default function ChangePasswordScreen() {
  const { colors, spacing, typography } = useTheme();
  const { session } = useAuth();
  const email = session?.user.email ?? null;
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    control,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { currentPassword: "", password: "", confirmPassword: "" },
  });

  const onSubmit = async (values: Values) => {
    if (!email) return;
    setSubmitError(null);
    setIsSubmitting(true);

    const verify = await verifyCurrentPassword(email, values.currentPassword);
    if (verify.error) {
      setIsSubmitting(false);
      setError("currentPassword", { message: "That's not your current password." });
      return;
    }

    const { error } = await updatePassword(values.password);
    setIsSubmitting(false);
    if (error) {
      setSubmitError(error);
      return;
    }

    // alertMessage has no way to run code once the user dismisses it — it
    // always resolves to a single bare "OK" button — so confirmAlert is
    // used directly here to navigate only once they've actually acknowledged
    // the change, not the moment the alert is shown.
    confirmAlert("Password updated", "Use your new password next time you sign in.", [
      { text: "OK", onPress: () => router.replace("/(app)/(tabs)") },
    ]);
  };

  const handleForgotPassword = () => {
    if (!email) return;
    confirmAlert("Forgot your current password?", `We'll email a password reset link to ${email}.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Send link",
        onPress: async () => {
          const { error } = await requestPasswordReset(email);
          if (error) alertMessage("Couldn't send reset link", error);
          else alertMessage("Check your email", "Open the link on this device to set a new password.");
        },
      },
    ]);
  };

  return (
    <ScreenContainer scroll>
      <Text style={[typography.title, { color: colors.textPrimary, marginBottom: spacing.xs }]}>Change password</Text>
      <Text style={[typography.body, { color: colors.textSecondary, marginBottom: spacing.lg }]}>
        Enter your current password, then choose a new one.
      </Text>

      <Controller
        control={control}
        name="currentPassword"
        render={({ field }) => (
          <TextField
            label="Current password"
            placeholder="Your current password"
            secureTextEntry
            autoComplete="current-password"
            value={field.value}
            onChangeText={field.onChange}
            error={errors.currentPassword?.message}
          />
        )}
      />
      <Controller
        control={control}
        name="password"
        render={({ field }) => (
          <TextField
            label="New password"
            placeholder="At least 8 characters, 1 uppercase, 1 number"
            secureTextEntry
            autoComplete="new-password"
            value={field.value}
            onChangeText={field.onChange}
            error={errors.password?.message}
          />
        )}
      />
      <Controller
        control={control}
        name="confirmPassword"
        render={({ field }) => (
          <TextField
            label="Confirm new password"
            placeholder="Re-enter your new password"
            secureTextEntry
            autoComplete="new-password"
            value={field.value}
            onChangeText={field.onChange}
            error={errors.confirmPassword?.message}
          />
        )}
      />

      {submitError ? <Text style={[typography.caption, { color: colors.danger, marginBottom: spacing.md }]}>{submitError}</Text> : null}

      <Button label="Update password" onPress={handleSubmit(onSubmit)} loading={isSubmitting} />

      <Pressable onPress={handleForgotPassword} style={{ marginTop: spacing.lg, alignSelf: "center" }}>
        <Text style={[typography.body, { color: colors.brand }]}>Forgot your current password?</Text>
      </Pressable>
    </ScreenContainer>
  );
}
