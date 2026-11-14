import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Text } from "react-native";
import { ReportTargetType, submitReport } from "@/features/reports/api";
import { friendlyErrorMessage } from "@/shared/lib/errors";
import { Button } from "@/shared/ui/Button";
import { ErrorNotice } from "@/shared/ui/ErrorNotice";
import { ScreenContainer } from "@/shared/ui/ScreenContainer";
import { TextField } from "@/shared/ui/TextField";
import { useTheme } from "@/shared/ui/theme";

export default function NewReportScreen() {
  const { targetType, targetId, label } = useLocalSearchParams<{
    targetType: ReportTargetType;
    targetId: string;
    label?: string;
  }>();
  const { colors, spacing, typography } = useTheme();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [reasonTouched, setReasonTouched] = useState(false);

  const reasonError = reasonTouched && !reason.trim() ? "Tell us what's wrong" : null;

  const handleSubmit = async () => {
    setReasonTouched(true);
    if (!reason.trim()) {
      setError("Tell us what's wrong");
      return;
    }
    setError(null);
    setIsSubmitting(true);
    try {
      await submitReport({ targetType, targetId, reason });
      setSubmitted(true);
    } catch (err) {
      setError(friendlyErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <ScreenContainer style={{ alignItems: "center", justifyContent: "center" }}>
        <Text style={[typography.title, { color: colors.textPrimary, marginBottom: spacing.sm, textAlign: "center" }]}>
          Report submitted
        </Text>
        <Text style={[typography.body, { color: colors.textSecondary, textAlign: "center", marginBottom: spacing.lg }]}>
          Thanks — we&apos;ll review it.
        </Text>
        <Button label="Done" onPress={() => router.back()} />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer scroll>
      <Text style={[typography.title, { color: colors.textPrimary, marginBottom: spacing.xs }]}>
        Report {label ?? targetType}
      </Text>
      <Text style={[typography.body, { color: colors.textSecondary, marginBottom: spacing.lg }]}>
        Tell us what&apos;s wrong. Reports are reviewed by LexxBridge.
      </Text>

      <TextField
        label="Reason *"
        placeholder="e.g. This post contains misleading legal advice"
        value={reason}
        onChangeText={setReason}
        onBlur={() => setReasonTouched(true)}
        multiline
        numberOfLines={4}
        style={{ height: 100, paddingTop: spacing.sm, textAlignVertical: "top" }}
        error={reasonError ?? undefined}
      />

      {error ? <ErrorNotice message={error} style={{ marginBottom: spacing.md }} /> : null}

      <Button label="Submit report" onPress={handleSubmit} loading={isSubmitting} />
    </ScreenContainer>
  );
}
