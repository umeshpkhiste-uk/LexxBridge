import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { SUPPORT_EMAIL } from "@/features/legal/legalContent";
import {
  fileGrievance,
  Grievance,
  GRIEVANCE_CATEGORIES,
  GRIEVANCE_RESPONSE_DAYS,
  GrievanceCategory,
  listMyGrievances,
} from "@/features/legal/dpdpApi";
import { alertMessage } from "@/shared/lib/alert";
import { friendlyErrorMessage } from "@/shared/lib/errors";
import { Button } from "@/shared/ui/Button";
import { ScreenContainer } from "@/shared/ui/ScreenContainer";
import { TextField } from "@/shared/ui/TextField";
import { ErrorView } from "@/shared/ui/LoadState";
import { useTheme } from "@/shared/ui/theme";

const STATUS_LABEL: Record<Grievance["status"], string> = { open: "Received", in_progress: "In progress", resolved: "Resolved" };

/** DPDP Act §13: a readily available way to raise a grievance about how
 * LexxBridge handles your personal data, with a reference number and a
 * stated response time. */
export default function PrivacyGrievanceScreen() {
  const { colors, spacing, radius, typography } = useTheme();
  const [category, setCategory] = useState<GrievanceCategory | null>(null);
  const [description, setDescription] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [history, setHistory] = useState<Grievance[]>([]);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const loadHistory = useCallback(() => {
    setHistoryError(null);
    listMyGrievances()
      .then(setHistory)
      .catch((err) => setHistoryError(friendlyErrorMessage(err)));
  }, []);

  useFocusEffect(loadHistory);

  const submit = async () => {
    if (!category) return;
    setIsSending(true);
    try {
      const filed = await fileGrievance(category, description);
      setHistory((prev) => [filed, ...prev]);
      setCategory(null);
      setDescription("");
      alertMessage(
        "Grievance received",
        `Your reference number is ${filed.reference}. We'll respond within ${GRIEVANCE_RESPONSE_DAYS} days.`,
      );
    } catch (err) {
      alertMessage("Couldn't submit", friendlyErrorMessage(err));
    } finally {
      setIsSending(false);
    }
  };

  const date = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

  return (
    <ScreenContainer scroll>
      <Text style={[typography.body, { color: colors.textSecondary, marginBottom: spacing.md }]}>
        Raise a concern about how LexxBridge collects, uses, shares or deletes your personal data. Our Grievance Officer will
        respond within {GRIEVANCE_RESPONSE_DAYS} days. You can also write to {SUPPORT_EMAIL}.
      </Text>

      <Text style={[typography.label, { color: colors.textPrimary, marginBottom: spacing.sm }]}>What is it about?</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginBottom: spacing.md }}>
        {GRIEVANCE_CATEGORIES.map((c) => {
          const selected = category === c.key;
          return (
            <Pressable
              key={c.key}
              onPress={() => setCategory(c.key)}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              style={{
                paddingHorizontal: spacing.md,
                paddingVertical: spacing.sm,
                borderRadius: radius.pill,
                borderWidth: 1,
                borderColor: selected ? colors.brand : colors.border,
                backgroundColor: selected ? colors.brand : colors.surface,
              }}
            >
              <Text style={[typography.caption, { color: selected ? colors.textInverse : colors.textPrimary, fontWeight: "600" }]}>{c.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <TextField
        label="Describe the issue"
        value={description}
        onChangeText={setDescription}
        placeholder="What happened, and what would you like us to do?"
        multiline
        numberOfLines={6}
        maxLength={4000}
        style={{ minHeight: 140, textAlignVertical: "top" }}
      />

      <Button label="Submit grievance" onPress={submit} loading={isSending} disabled={!category || description.trim().length < 10} pill />

      <Text style={[typography.caption, { color: colors.textSecondary, marginTop: spacing.md }]}>
        If you&apos;re not satisfied with our response, you may complain to the Data Protection Board of India.
      </Text>

      {historyError && history.length === 0 ? (
        <ErrorView message={historyError} onRetry={loadHistory} style={{ marginTop: spacing.xl }} />
      ) : null}
      {history.length ? (
        <View style={{ marginTop: spacing.xl, gap: spacing.sm }}>
          <Text style={[typography.subtitle, { color: colors.textPrimary }]}>Your grievances</Text>
          {history.map((g) => (
            <View key={g.id} style={{ backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, gap: 4 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={[typography.bodyStrong, { color: colors.textPrimary }]}>{g.reference}</Text>
                <Text style={[typography.caption, { color: g.status === "resolved" ? colors.brand : colors.accent, fontWeight: "600" }]}>
                  {STATUS_LABEL[g.status]}
                </Text>
              </View>
              <Text style={[typography.caption, { color: colors.textSecondary }]}>
                {GRIEVANCE_CATEGORIES.find((c) => c.key === g.category)?.label} · {date(g.created_at)}
              </Text>
              <Text style={[typography.body, { color: colors.textPrimary }]} numberOfLines={3}>
                {g.description}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </ScreenContainer>
  );
}
