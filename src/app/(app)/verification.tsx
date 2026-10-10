import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { getMyProfile } from "@/features/profile/api";
import { getMyVerification, submitVerificationRequest, VerificationStatus } from "@/features/verification/api";
import { alertMessage } from "@/shared/lib/alert";
import { Badge } from "@/shared/ui/Badge";
import { Button } from "@/shared/ui/Button";
import { PickedReceipt, ReceiptPicker } from "@/shared/ui/ReceiptPicker";
import { ScreenContainer } from "@/shared/ui/ScreenContainer";
import { TextField } from "@/shared/ui/TextField";
import { useTheme } from "@/shared/ui/theme";

const STATUS_COPY: Record<VerificationStatus, { label: string; tone: "neutral" | "warning" | "success" | "danger" }> = {
  unverified: { label: "Not verified", tone: "neutral" },
  pending: { label: "Under review", tone: "warning" },
  verified: { label: "Verified", tone: "success" },
  rejected: { label: "Rejected", tone: "danger" },
  expired: { label: "Expired", tone: "neutral" },
};

export default function VerificationScreen() {
  const { colors, spacing, typography } = useTheme();
  const [status, setStatus] = useState<VerificationStatus | null>(null);
  const [notes, setNotes] = useState<string | null>(null);
  const [barNumber, setBarNumber] = useState("");
  const [barState, setBarState] = useState("");
  const [document, setDocument] = useState<PickedReceipt | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([getMyVerification(), getMyProfile()])
      .then(([v, profile]) => {
        setStatus(v.status);
        setNotes(v.notes);
        setBarNumber(profile.bar_registration_number ?? "");
        setBarState(profile.bar_council_state ?? "");
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Something went wrong"))
      .finally(() => setLoading(false));
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const canSubmit = Boolean(status !== "pending" && barNumber.trim() && barState.trim() && document && !submitting);

  const handleSubmit = async () => {
    if (!document) return;
    setSubmitting(true);
    try {
      await submitVerificationRequest({
        fileUri: document.uri,
        mimeType: document.mimeType,
        barNumber: barNumber.trim(),
        barState: barState.trim(),
      });
      alertMessage("Submitted", "We've received your verification request. We'll review it and let you know.");
      router.back();
    } catch (err) {
      alertMessage("Couldn't submit", err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <ScreenContainer style={{ alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={colors.brand} />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer scroll>
      {error ? <Text style={[typography.body, { color: colors.danger, marginBottom: spacing.md }]}>{error}</Text> : null}

      {status ? (
        <View style={{ marginBottom: spacing.lg }}>
          <Badge label={STATUS_COPY[status].label} tone={STATUS_COPY[status].tone} />
        </View>
      ) : null}

      {status === "pending" ? (
        <Text style={[typography.body, { color: colors.textSecondary, marginBottom: spacing.lg }]}>
          Your verification request is under review. We&apos;ll let you know once it&apos;s been checked.
        </Text>
      ) : (
        <>
          <Text style={[typography.body, { color: colors.textSecondary, marginBottom: spacing.lg }]}>
            Verified advocates get a badge on their profile. Submit your Bar Council enrollment number and a photo of
            your enrollment certificate or ID for review.
          </Text>

          {status === "rejected" && notes ? (
            <View style={{ marginBottom: spacing.lg, padding: spacing.md, borderRadius: 12, backgroundColor: colors.surfaceAlt }}>
              <Text style={[typography.label, { color: colors.textSecondary, marginBottom: spacing.xs }]}>
                Why your last request was rejected
              </Text>
              <Text style={[typography.body, { color: colors.textPrimary }]}>{notes}</Text>
            </View>
          ) : null}

          <TextField label="Bar registration / enrollment number" value={barNumber} onChangeText={setBarNumber} placeholder="e.g. MAH/1234/2020" />
          <TextField label="Bar Council state" value={barState} onChangeText={setBarState} placeholder="e.g. Maharashtra" />
          <ReceiptPicker value={document} onChange={setDocument} label="Bar Council ID / enrollment certificate photo" />

          <Button label="Submit for review" onPress={handleSubmit} loading={submitting} disabled={!canSubmit} />
        </>
      )}
    </ScreenContainer>
  );
}
