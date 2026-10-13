import { Ionicons } from "@expo/vector-icons";
import DateTimePicker, { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import { useState } from "react";
import { Alert, Modal, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button } from "@/shared/ui/Button";
import { useTheme } from "@/shared/ui/theme";
import { setNextHearing } from "./api";
import { offerPaymentReminder } from "./paymentReminder";

type Props = {
  caseId: string;
  caseTitle?: string;
  /** Current next hearing (ISO), used as the starting value. */
  current: string | null;
  onClose: () => void;
  onSaved: () => void;
};

/** Default for a new hearing: tomorrow at 10:30, when courts usually sit. */
function defaultDate(current: string | null) {
  if (current && new Date(current) >= new Date()) return new Date(current);
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(10, 30, 0, 0);
  return d;
}

/**
 * Bottom sheet for picking a case's next hearing date and time in place, with
 * Save and Cancel. Mount it only while open, so each opening starts from the
 * current date.
 */
export function NextHearingSheet({ caseId, caseTitle, current, onClose, onSaved }: Props) {
  const { colors, spacing, radius, typography, scheme } = useTheme();
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState(() => defaultDate(current));
  const [isSaving, setIsSaving] = useState(false);
  const today = new Date(new Date().setHours(0, 0, 0, 0));

  const save = async () => {
    setIsSaving(true);
    try {
      await setNextHearing(caseId, draft);
      onSaved();
      onClose();
      offerPaymentReminder({ caseId, hearingAt: draft }).catch(() => {});
    } catch (err) {
      Alert.alert("Couldn't save hearing date", err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsSaving(false);
    }
  };

  const openAndroid = (mode: "date" | "time") =>
    DateTimePickerAndroid.open({
      value: draft,
      mode,
      minimumDate: mode === "date" ? today : undefined,
      onValueChange: (_e, picked) => {
        const next = new Date(draft);
        if (mode === "date") next.setFullYear(picked.getFullYear(), picked.getMonth(), picked.getDate());
        else next.setHours(picked.getHours(), picked.getMinutes(), 0, 0);
        setDraft(next);
      },
    });

  const dateLabel = draft.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
  const timeLabel = draft.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={{
            backgroundColor: colors.surface,
            borderTopLeftRadius: radius.lg,
            borderTopRightRadius: radius.lg,
            paddingHorizontal: spacing.md,
            paddingTop: spacing.md,
            paddingBottom: insets.bottom + spacing.md,
          }}
        >
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={[typography.subtitle, { color: colors.textPrimary }]}>{current ? "Change next hearing" : "Schedule next hearing"}</Text>
              {caseTitle ? (
                <Text style={[typography.caption, { color: colors.textSecondary }]} numberOfLines={1}>
                  {caseTitle}
                </Text>
              ) : null}
            </View>
            <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Close">
              <Ionicons name="close" size={24} color={colors.textSecondary} />
            </Pressable>
          </View>

          {Platform.OS === "ios" ? (
            <>
              <DateTimePicker
                value={draft}
                mode="date"
                display="inline"
                minimumDate={today}
                accentColor={colors.brand}
                themeVariant={scheme === "dark" ? "dark" : "light"}
                onValueChange={(_e, picked) => {
                  const next = new Date(draft);
                  next.setFullYear(picked.getFullYear(), picked.getMonth(), picked.getDate());
                  setDraft(next);
                }}
                style={{ alignSelf: "center" }}
              />
              <View style={[styles.timeRow, { borderTopColor: colors.border, paddingVertical: spacing.sm }]}>
                <Text style={[typography.bodyStrong, { color: colors.textPrimary }]}>Time</Text>
                <DateTimePicker
                  value={draft}
                  mode="time"
                  display="compact"
                  accentColor={colors.brand}
                  themeVariant={scheme === "dark" ? "dark" : "light"}
                  onValueChange={(_e, picked) => {
                    const next = new Date(draft);
                    next.setHours(picked.getHours(), picked.getMinutes(), 0, 0);
                    setDraft(next);
                  }}
                />
              </View>
            </>
          ) : (
            <View style={{ gap: spacing.sm, marginVertical: spacing.md }}>
              {(["date", "time"] as const).map((mode) => (
                <Pressable
                  key={mode}
                  onPress={() => openAndroid(mode)}
                  style={[styles.androidRow, { borderColor: colors.border, borderRadius: radius.md, padding: spacing.md }]}
                >
                  <Ionicons name={mode === "date" ? "calendar-outline" : "time-outline"} size={20} color={colors.brand} />
                  <Text style={[typography.body, { flex: 1, color: colors.textPrimary }]}>{mode === "date" ? dateLabel : timeLabel}</Text>
                  <Ionicons name="chevron-down" size={18} color={colors.textSecondary} />
                </Pressable>
              ))}
            </View>
          )}

          <Text style={[typography.caption, { color: colors.textSecondary, textAlign: "center", marginVertical: spacing.sm }]}>
            {dateLabel} · {timeLabel}
          </Text>
          <View style={{ gap: spacing.xs }}>
            <Button label="Save" onPress={save} loading={isSaving} pill />
            <Button label="Cancel" variant="ghost" onPress={onClose} />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(15, 23, 42, 0.4)" },
  header: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  timeRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderTopWidth: StyleSheet.hairlineWidth },
  androidRow: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1 },
});
