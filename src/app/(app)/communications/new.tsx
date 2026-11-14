import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { CommunicationType, createCommunication } from "@/features/communications/api";
import { friendlyErrorMessage } from "@/shared/lib/errors";
import { Button } from "@/shared/ui/Button";
import { Chip } from "@/shared/ui/Chip";
import { DateField } from "@/shared/ui/DateField";
import { ErrorNotice } from "@/shared/ui/ErrorNotice";
import { ScreenContainer } from "@/shared/ui/ScreenContainer";
import { TextField } from "@/shared/ui/TextField";
import { useTheme } from "@/shared/ui/theme";

const TYPES: { key: CommunicationType; label: string }[] = [
  { key: "phone_call", label: "Phone call" },
  { key: "email", label: "Email" },
  { key: "sms", label: "SMS" },
  { key: "whatsapp_manual", label: "WhatsApp" },
  { key: "video_call", label: "Video call" },
  { key: "meeting", label: "Meeting" },
  { key: "other", label: "Other" },
];

export default function NewCommunicationScreen() {
  const { caseId, clientId } = useLocalSearchParams<{ caseId?: string; clientId: string }>();
  const { colors, spacing } = useTheme();
  const now = new Date();

  const [type, setType] = useState<CommunicationType>("phone_call");
  const [occurredAt, setOccurredAt] = useState<Date | null>(now);
  const [summary, setSummary] = useState("");
  const [followUp, setFollowUp] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [summaryTouched, setSummaryTouched] = useState(false);

  const summaryError = summaryTouched && !summary.trim() ? "Add a short summary" : null;

  const handleSave = async () => {
    setSummaryTouched(true);
    if (!occurredAt) {
      setError("Choose when this happened");
      return;
    }
    if (!summary.trim()) {
      setError("Add a short summary");
      return;
    }
    setError(null);
    setIsSubmitting(true);
    try {
      await createCommunication({ clientId, caseId, communicationType: type, occurredAt, summary, followUp });
      router.back();
    } catch (err) {
      setError(friendlyErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ScreenContainer scroll>
      <Text style={{ color: colors.textSecondary, fontSize: 13, fontWeight: "600", marginBottom: spacing.xs }}>
        Type
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: spacing.md }}>
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          {TYPES.map((t) => (
            <Chip key={t.key} label={t.label} selected={t.key === type} onPress={() => setType(t.key)} />
          ))}
        </View>
      </ScrollView>

      <DateField label="Date & time" value={occurredAt} onChange={setOccurredAt} mode="datetime" maximumDate={new Date()} />
      <TextField
        label="Summary *"
        placeholder="e.g. Called client to discuss next hearing date"
        value={summary}
        onChangeText={setSummary}
        onBlur={() => setSummaryTouched(true)}
        multiline
        numberOfLines={3}
        error={summaryError ?? undefined}
      />
      <TextField
        label="Follow-up"
        placeholder="e.g. Send draft affidavit for client's review"
        value={followUp}
        onChangeText={setFollowUp}
        multiline
        numberOfLines={2}
      />

      {error ? <ErrorNotice message={error} style={{ marginBottom: spacing.md }} /> : null}

      <Button label="Save record" onPress={handleSave} loading={isSubmitting} />
    </ScreenContainer>
  );
}
