import { router, Stack, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Text } from "react-native";
import { createHearing, getHearing, updateHearing } from "@/features/hearings/api";
import { offerPaymentReminder } from "@/features/hearings/paymentReminder";
import { Button } from "@/shared/ui/Button";
import { DateField } from "@/shared/ui/DateField";
import { ScreenContainer } from "@/shared/ui/ScreenContainer";
import { TextField } from "@/shared/ui/TextField";
import { useTheme } from "@/shared/ui/theme";

/** Schedule a hearing, or — with ?id= — edit an existing one. */
export default function NewHearingScreen() {
  const { caseId, id } = useLocalSearchParams<{ caseId?: string; id?: string }>();
  const isEdit = !!id;
  const [loaded, setLoaded] = useState(!isEdit);
  const { colors, spacing } = useTheme();
  const now = new Date();

  const [resolvedCaseId, setResolvedCaseId] = useState(caseId);
  const [hearingAt, setHearingAt] = useState<Date | null>(now);
  const [court, setCourt] = useState("");
  const [courtroom, setCourtroom] = useState("");
  const [hearingType, setHearingType] = useState("");
  const [purpose, setPurpose] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [touched, setTouched] = useState<{ hearingType?: boolean }>({});

  const hearingTypeError = touched.hearingType && !hearingType.trim() ? "Hearing title is required" : null;

  useEffect(() => {
    if (!id) return;
    getHearing(id)
      .then((h) => {
        setResolvedCaseId(h.case_id);
        setHearingAt(new Date(h.hearing_at));
        setCourt(h.court ?? "");
        setCourtroom(h.courtroom ?? "");
        setHearingType(h.hearing_type ?? "");
        setPurpose(h.purpose ?? "");
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Couldn't load this hearing"))
      .finally(() => setLoaded(true));
  }, [id]);

  const handleSave = async () => {
    setTouched({ hearingType: true });
    if (!hearingType.trim()) {
      setError("Hearing title is required");
      return;
    }
    if (!hearingAt) {
      setError("Choose the hearing date and time");
      return;
    }
    setError(null);
    setIsSubmitting(true);
    try {
      if (id) await updateHearing(id, { hearingAt, court, courtroom, hearingType, purpose });
      else await createHearing({ caseId: caseId!, hearingAt, court, courtroom, hearingType, purpose });
      offerPaymentReminder({ caseId: resolvedCaseId!, hearingAt }).catch(() => {});
      router.back();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!loaded) {
    return (
      <ScreenContainer style={{ alignItems: "center", justifyContent: "center" }}>
        <Stack.Screen options={{ title: "Edit hearing" }} />
        <ActivityIndicator color={colors.brand} />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer scroll>
      <Stack.Screen options={{ title: isEdit ? "Edit hearing" : "Schedule hearing" }} />
      {/* Same layout as the task form: title, description, date, then details. */}
      <TextField
        label="Hearing title *"
        placeholder="e.g. Argument, Evidence"
        value={hearingType}
        onChangeText={setHearingType}
        onBlur={() => setTouched((t) => ({ ...t, hearingType: true }))}
        error={hearingTypeError ?? undefined}
      />
      <TextField
        label="Description"
        placeholder="e.g. Cross-examination of the plaintiff's witness"
        value={purpose}
        onChangeText={setPurpose}
        multiline
        numberOfLines={3}
      />
      <DateField label="Date & time" value={hearingAt} onChange={setHearingAt} mode="datetime" />
      <TextField label="Court" placeholder="e.g. Bombay High Court" value={court} onChangeText={setCourt} />
      <TextField label="Courtroom" placeholder="e.g. Court Room 4" value={courtroom} onChangeText={setCourtroom} />

      {error ? <Text style={{ color: colors.danger, marginBottom: spacing.md }}>{error}</Text> : null}

      <Button label={isEdit ? "Save changes" : "Schedule hearing"} onPress={handleSave} loading={isSubmitting} />
    </ScreenContainer>
  );
}
