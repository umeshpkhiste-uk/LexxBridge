import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { CasePriority, createCase } from "@/features/cases/api";
import { Client, getClient, listClients } from "@/features/clients/api";
import { CASE_TYPE_OPTIONS } from "@/shared/data/caseTypes";
import { COURT_OPTIONS } from "@/shared/data/courts";
import { caseNumberError, normalizeCaseNumber } from "@/shared/lib/validation";
import { Button } from "@/shared/ui/Button";
import { ScreenContainer } from "@/shared/ui/ScreenContainer";
import { SelectField } from "@/shared/ui/SelectField";
import { TextField } from "@/shared/ui/TextField";
import { useTheme } from "@/shared/ui/theme";

const PRIORITIES: CasePriority[] = ["low", "medium", "high"];
const PRIORITY_ICONS: Record<CasePriority, "arrow-down-circle-outline" | "remove-circle-outline" | "arrow-up-circle-outline"> = {
  low: "arrow-down-circle-outline",
  medium: "remove-circle-outline",
  high: "arrow-up-circle-outline",
};

export default function NewCaseScreen() {
  const { clientId: preselectedClientId } = useLocalSearchParams<{ clientId?: string }>();
  const { colors, spacing, radius, typography } = useTheme();

  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [clientOptions, setClientOptions] = useState<Client[] | null>(null);

  const [title, setTitle] = useState("");
  const [caseNumber, setCaseNumber] = useState("");
  const [caseType, setCaseType] = useState("");
  const [court, setCourt] = useState("");
  const [bench, setBench] = useState("");
  const [priority, setPriority] = useState<CasePriority>("medium");
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");
  const [agreedFee, setAgreedFee] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [touched, setTouched] = useState<{ title?: boolean; caseNumber?: boolean; agreedFee?: boolean }>({});

  const titleErr = touched.title && !title.trim() ? "Case title is required" : null;
  const caseNumberErr = touched.caseNumber ? caseNumberError(caseNumber) : null;
  const agreedFeeErr =
    touched.agreedFee && agreedFee.trim() && (Number.isNaN(Number(agreedFee)) || Number(agreedFee) < 0)
      ? "Enter a valid amount"
      : null;

  useEffect(() => {
    if (preselectedClientId) {
      getClient(preselectedClientId).then(setSelectedClient).catch((err) => setError(err.message));
    } else {
      listClients().then(setClientOptions).catch((err) => setError(err.message));
    }
  }, [preselectedClientId]);

  const handleSave = async () => {
    setTouched({ title: true, caseNumber: true, agreedFee: true });
    if (!selectedClient) {
      setError("Select a client for this case");
      return;
    }
    if (!title.trim()) {
      setError("Case title is required");
      return;
    }
    const caseNumberSubmitErr = caseNumberError(caseNumber);
    if (caseNumberSubmitErr) {
      setError(`Case number: ${caseNumberSubmitErr}`);
      return;
    }
    const fee = agreedFee.trim() ? Number(agreedFee) : null;
    if (fee !== null && (Number.isNaN(fee) || fee < 0)) {
      setError("Total fees agreed: enter a valid amount");
      return;
    }
    setError(null);
    setIsSubmitting(true);
    const caseNumberValue = caseNumber.trim() ? normalizeCaseNumber(caseNumber) ?? caseNumber.trim() : "";
    try {
      await createCase({
        clientId: selectedClient.id,
        title,
        caseNumber: caseNumberValue,
        caseType,
        court,
        bench,
        priority,
        description,
        internalNotes: notes,
        agreedFee: fee,
      });
      router.replace("/(app)/(tabs)/cases");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!selectedClient && clientOptions === null) {
    return (
      <ScreenContainer style={{ alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={colors.brand} />
      </ScreenContainer>
    );
  }

  if (!selectedClient) {
    return (
      <ScreenContainer scroll>
        <Text style={[typography.title, { color: colors.textPrimary, marginBottom: spacing.xs }]}>
          Select a client
        </Text>
        <Text style={[typography.body, { color: colors.textSecondary, marginBottom: spacing.lg }]}>
          Every case belongs to a client.
        </Text>

        {clientOptions && clientOptions.length === 0 ? (
          <View>
            <Text style={[typography.body, { color: colors.textSecondary, marginBottom: spacing.md }]}>
              You don&apos;t have any clients yet.
            </Text>
            <Button label="Add a client first" onPress={() => router.replace("/(app)/clients/new")} />
          </View>
        ) : (
          clientOptions?.map((client) => (
            <Pressable
              key={client.id}
              onPress={() => setSelectedClient(client)}
              style={{
                backgroundColor: colors.surface,
                borderColor: colors.border,
                borderWidth: 1,
                borderRadius: radius.md,
                padding: spacing.md,
                marginBottom: spacing.sm,
              }}
            >
              <Text style={[typography.bodyStrong, { color: colors.textPrimary }]}>{client.full_name}</Text>
            </Pressable>
          ))
        )}
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer scroll>
      <Text style={[typography.label, { color: colors.textSecondary, marginBottom: spacing.xs }]}>Client</Text>
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          backgroundColor: colors.surfaceAlt,
          borderRadius: radius.md,
          padding: spacing.md,
          marginBottom: spacing.lg,
        }}
      >
        <Text style={[typography.bodyStrong, { color: colors.textPrimary }]}>{selectedClient.full_name}</Text>
        {!preselectedClientId ? (
          <Text style={[typography.caption, { color: colors.brand }]} onPress={() => setSelectedClient(null)}>
            Change
          </Text>
        ) : null}
      </View>

      <Text style={[typography.subtitle, { color: colors.brand, marginBottom: spacing.sm }]}>Case</Text>
      <TextField
        label="Case title *"
        placeholder="e.g. Sharma vs. Verma"
        value={title}
        onChangeText={setTitle}
        onBlur={() => setTouched((t) => ({ ...t, title: true }))}
        error={titleErr ?? undefined}
      />
      <TextField
        label="Case number"
        placeholder="e.g. CS/123/2024 or CNR"
        value={caseNumber}
        onChangeText={setCaseNumber}
        onBlur={() => {
          setTouched((t) => ({ ...t, caseNumber: true }));
          const tidy = normalizeCaseNumber(caseNumber);
          if (tidy) setCaseNumber(tidy);
        }}
        autoCapitalize="characters"
        error={caseNumberErr ?? undefined}
      />
      <SelectField
        label="Case type"
        icon="folder-outline"
        value={caseType || null}
        options={CASE_TYPE_OPTIONS.map((c) => ({ value: c, label: c }))}
        onChange={setCaseType}
        allowCustom
        searchable
        placeholder="Select case type"
      />
      <TextField
        label="Total fees agreed (₹)"
        placeholder="e.g. 25000"
        value={agreedFee}
        onChangeText={setAgreedFee}
        onBlur={() => setTouched((t) => ({ ...t, agreedFee: true }))}
        keyboardType="decimal-pad"
        error={agreedFeeErr ?? undefined}
      />
      <SelectField<CasePriority>
        label="Priority"
        icon="flag-outline"
        value={priority}
        options={PRIORITIES.map((p) => ({ value: p, label: p.charAt(0).toUpperCase() + p.slice(1), icon: PRIORITY_ICONS[p] }))}
        onChange={setPriority}
      />

      <Text style={[typography.subtitle, { color: colors.brand, marginTop: spacing.md, marginBottom: spacing.sm }]}>Court</Text>
      <SelectField
        label="Court"
        icon="business-outline"
        value={court || null}
        options={COURT_OPTIONS.map((c) => ({ value: c, label: c }))}
        onChange={setCourt}
        allowCustom
        placeholder="Select court"
      />
      <TextField label="Bench" placeholder="e.g. Division Bench II" value={bench} onChangeText={setBench} />

      <Text style={[typography.subtitle, { color: colors.brand, marginTop: spacing.md, marginBottom: spacing.sm }]}>Summary & Notes</Text>
      <TextField
        label="Summary"
        placeholder="e.g. Brief facts of the case"
        value={description}
        onChangeText={setDescription}
        multiline
        numberOfLines={3}
      />
      <TextField
        label="Internal notes (private)"
        placeholder="e.g. Client prefers WhatsApp updates"
        value={notes}
        onChangeText={setNotes}
        multiline
        numberOfLines={3}
      />

      {error ? <Text style={{ color: colors.danger, marginBottom: spacing.md }}>{error}</Text> : null}

      <Button label="Create case" onPress={handleSave} loading={isSubmitting} />
    </ScreenContainer>
  );
}
