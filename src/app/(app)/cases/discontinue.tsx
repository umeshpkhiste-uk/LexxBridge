import { router, Stack, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Text } from "react-native";
import { downloadCaseHandoverPdf } from "@/features/cases/caseHandover";
import { markCaseDiscontinued } from "@/features/cases/api";
import { confirmAlert } from "@/shared/lib/alert";
import { Button } from "@/shared/ui/Button";
import { ScreenContainer } from "@/shared/ui/ScreenContainer";
import { TextField } from "@/shared/ui/TextField";
import { useTheme } from "@/shared/ui/theme";

/** Marks a case as discontinued — the client ended the engagement or moved
 * to another advocate, distinct from winning/losing the case. Archives the
 * case and offers a case-summary handover to share. */
export default function DiscontinueCaseScreen() {
  const { caseId } = useLocalSearchParams<{ caseId: string }>();
  const { colors, spacing, typography } = useTheme();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleConfirm = () => {
    confirmAlert(
      "Mark case as discontinued?",
      "This archives the case and records that the client ended the engagement. You can undo this later from the case's Edit screen.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Mark as discontinued",
          style: "destructive",
          onPress: async () => {
            setIsSubmitting(true);
            try {
              await markCaseDiscontinued(caseId, reason);
              confirmAlert("Share a case summary?", "Send a summary of this case's hearing history for the client or next advocate.", [
                { text: "Not now", style: "cancel", onPress: () => router.back() },
                {
                  text: "Share summary",
                  onPress: async () => {
                    await downloadCaseHandoverPdf(caseId).catch(() => {});
                    router.back();
                  },
                },
              ]);
            } catch (err) {
              setError(err instanceof Error ? err.message : "Something went wrong");
            } finally {
              setIsSubmitting(false);
            }
          },
        },
      ],
    );
  };

  return (
    <ScreenContainer scroll>
      <Stack.Screen options={{ title: "Client discontinued" }} />
      <Text style={[typography.body, { color: colors.textSecondary, marginBottom: spacing.lg }]}>
        Mark this case as discontinued if the client has moved to another advocate or ended the engagement. The case will be archived
        and kept in your records — it won&apos;t show up in your active case lists any more.
      </Text>
      <TextField label="Reason (optional)" placeholder="e.g. Client switched advocates" value={reason} onChangeText={setReason} multiline numberOfLines={3} />
      {error ? <Text style={{ color: colors.danger, marginBottom: spacing.md }}>{error}</Text> : null}
      <Button label="Mark as discontinued" onPress={handleConfirm} loading={isSubmitting} variant="danger" />
    </ScreenContainer>
  );
}
