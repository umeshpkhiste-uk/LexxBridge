import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { getMyNominee, removeMyNominee, saveMyNominee } from "@/features/legal/dpdpApi";
import { alertMessage, confirmAlert } from "@/shared/lib/alert";
import { friendlyErrorMessage } from "@/shared/lib/errors";
import { Button } from "@/shared/ui/Button";
import { ScreenContainer } from "@/shared/ui/ScreenContainer";
import { TextField } from "@/shared/ui/TextField";
import { LoadState } from "@/shared/ui/LoadState";
import { useTheme } from "@/shared/ui/theme";

/** DPDP Act §14: name someone who can exercise your data rights (access,
 * correction, erasure, grievance) if you die or become incapacitated. */
export default function NomineeScreen() {
  const { colors, spacing, radius, typography } = useTheme();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [hasNominee, setHasNominee] = useState(false);
  const [fullName, setFullName] = useState("");
  const [relationship, setRelationship] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    getMyNominee()
      .then((n) => {
        if (!n) return;
        setHasNominee(true);
        setFullName(n.full_name);
        setRelationship(n.relationship);
        setEmail(n.email ?? "");
        setPhone(n.phone ?? "");
      })
      .catch((err) => setError(friendlyErrorMessage(err)))
      .finally(() => setIsLoading(false));
  }, [attempt]);

  const retryLoad = () => {
    setError(null);
    setIsLoading(true);
    setAttempt((n) => n + 1);
  };

  const save = async () => {
    setIsSaving(true);
    try {
      await saveMyNominee({ fullName, relationship, email, phone });
      confirmAlert("Nominee saved", `${fullName.trim()} can now exercise your data rights if you're unable to.`, [
        { text: "OK", onPress: () => router.back() },
      ]);
    } catch (err) {
      alertMessage("Couldn't save nominee", friendlyErrorMessage(err));
    } finally {
      setIsSaving(false);
    }
  };

  const remove = () =>
    confirmAlert("Remove nominee?", "No one will be able to exercise your data rights on your behalf.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          try {
            await removeMyNominee();
            router.back();
          } catch (err) {
            alertMessage("Couldn't remove nominee", friendlyErrorMessage(err));
          }
        },
      },
    ]);

  // Not the form: saving its blank fields would overwrite the saved nominee.
  if (isLoading || error) {
    return (
      <ScreenContainer>
        <LoadState error={error} onRetry={retryLoad} />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer scroll>
      <View style={{ backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.lg }}>
        <Text style={[typography.body, { color: colors.textPrimary }]}>
          Under the Digital Personal Data Protection Act, 2023, you can nominate a person to exercise your data rights —
          access, correction, erasure and grievances — if you die or become unable to do so yourself.
        </Text>
        <Text style={[typography.caption, { color: colors.textSecondary, marginTop: spacing.sm }]}>
          Your nominee makes a request by writing to our Grievance Officer with proof (such as a death certificate or a
          medical certificate). We verify it against the details saved here. Your nominee is not told about this and gets no
          access to your account until then.
        </Text>
      </View>

      <TextField label="Nominee's full name" value={fullName} onChangeText={setFullName} autoCapitalize="words" maxLength={120} />
      <TextField label="Relationship to you" placeholder="e.g. Spouse, Son, Partner at chambers" value={relationship} onChangeText={setRelationship} maxLength={60} />
      <TextField label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" maxLength={254} />
      <TextField label="Phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" maxLength={20} />
      <Text style={[typography.caption, { color: colors.textSecondary, marginBottom: spacing.lg }]}>
        Add at least an email or a phone number so we can verify your nominee.
      </Text>

      <Button label={hasNominee ? "Update nominee" : "Save nominee"} onPress={save} loading={isSaving} pill />
      {hasNominee ? (
        <View style={{ marginTop: spacing.md }}>
          <Button label="Remove nominee" variant="secondary" onPress={remove} pill />
        </View>
      ) : null}
    </ScreenContainer>
  );
}
