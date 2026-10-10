import { Ionicons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { NextHearingSheet } from "@/features/hearings/NextHearingSheet";
import { CaseDocument, deleteDocument, getDocumentSignedUrl, listDocumentsForCase, uploadDocument } from "@/features/documents/api";
import { listTransactionsForCase } from "@/features/transactions/api";
import { computeFeeTotals } from "@/features/transactions/feeTotals";
import { CASE_TYPE_OPTIONS } from "@/shared/data/caseTypes";
import { COURT_OPTIONS } from "@/shared/data/courts";
import { formatHearingDate, formatINR } from "@/shared/lib/format";
import { caseNumberError, normalizeCaseNumber } from "@/shared/lib/validation";
import { Button } from "@/shared/ui/Button";
import { SelectField } from "@/shared/ui/SelectField";
import { DateField, fromDateOnly, toDateOnly } from "@/shared/ui/DateField";
import { TextField } from "@/shared/ui/TextField";
import { useTheme } from "@/shared/ui/theme";
import { CaseDetail, CasePriority, updateCase } from "./api";

const PRIORITIES: CasePriority[] = ["low", "medium", "high"];
const PRIORITY_ICONS: Record<CasePriority, "arrow-down-circle-outline" | "remove-circle-outline" | "arrow-up-circle-outline"> = {
  low: "arrow-down-circle-outline",
  medium: "remove-circle-outline",
  high: "arrow-up-circle-outline",
};

function formatDay(value: string | null) {
  const date = fromDateOnly(value);
  return date ? date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : null;
}

function fileIcon(doc: CaseDocument): keyof typeof Ionicons.glyphMap {
  const type = doc.mime_type ?? "";
  if (type.includes("pdf")) return "document-text-outline";
  if (type.startsWith("image/")) return "image-outline";
  if (type.includes("word") || type.includes("document")) return "reader-outline";
  if (type.includes("sheet") || type.includes("excel")) return "grid-outline";
  return "document-outline";
}

function fileSize(bytes: number | null) {
  if (!bytes) return null;
  return bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** Case Overview: key dates, case details, notes and documents, with the
 * edit form swapped in while editing (the Edit button lives in the header). */
export function CaseOverview({
  caseDetail,
  onUpdated,
  isEditing,
  setIsEditing,
}: {
  caseDetail: CaseDetail;
  onUpdated: () => void;
  isEditing: boolean;
  setIsEditing: (editing: boolean) => void;
}) {
  const { colors, spacing, radius, typography } = useTheme();
  const [documents, setDocuments] = useState<CaseDocument[] | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [hearingSheetOpen, setHearingSheetOpen] = useState(false);
  // "Total fees agreed" below folds in logged expenses too, matching the
  // Financials tab — so it needs this case's own transactions, re-fetched
  // on every focus since an expense is usually added from another screen.
  const [expenses, setExpenses] = useState(0);

  const loadDocuments = useCallback(() => {
    listDocumentsForCase(caseDetail.id)
      .then(setDocuments)
      .catch(() => setDocuments([]));
  }, [caseDetail.id]);

  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

  useFocusEffect(
    useCallback(() => {
      let isMounted = true;
      listTransactionsForCase(caseDetail.id)
        .then((transactions) => {
          if (isMounted) setExpenses(computeFeeTotals([caseDetail], transactions).expenses);
        })
        .catch(() => {});
      return () => {
        isMounted = false;
      };
    }, [caseDetail]),
  );

  const handleUpload = async () => {
    const result = await DocumentPicker.getDocumentAsync({ type: "*/*", copyToCacheDirectory: true });
    if (result.canceled || !result.assets?.[0]) return;
    const file = result.assets[0];
    setIsUploading(true);
    try {
      const doc = await uploadDocument({
        caseId: caseDetail.id,
        fileUri: file.uri,
        fileName: file.name,
        mimeType: file.mimeType ?? "application/octet-stream",
        fileSize: file.size ?? undefined,
        category: "other",
      });
      setDocuments((prev) => (prev ? [doc, ...prev] : [doc]));
    } catch (err) {
      Alert.alert("Upload failed", err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsUploading(false);
    }
  };

  const openDocument = async (doc: CaseDocument) => {
    try {
      Linking.openURL(await getDocumentSignedUrl(doc.storage_path));
    } catch (err) {
      Alert.alert("Couldn't open document", err instanceof Error ? err.message : "Something went wrong");
    }
  };

  const confirmDelete = (doc: CaseDocument) =>
    Alert.alert("Delete document?", `${doc.file_name} will be permanently removed from this case.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteDocument(doc.id, doc.storage_path);
            setDocuments((prev) => prev?.filter((d) => d.id !== doc.id) ?? null);
          } catch (err) {
            Alert.alert("Couldn't delete document", err instanceof Error ? err.message : "Something went wrong");
          }
        },
      },
    ]);

  if (isEditing) {
    return (
      <CaseEditForm
        caseDetail={caseDetail}
        onCancel={() => setIsEditing(false)}
        onSaved={() => {
          setIsEditing(false);
          onUpdated();
        }}
      />
    );
  }

  const hasUpcoming = !!caseDetail.next_hearing_at && new Date(caseDetail.next_hearing_at) >= new Date(new Date().setHours(0, 0, 0, 0));
  const card = [styles.card, { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md }];

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xxl }}>
      {/* Key dates */}
      <View style={card}>
        <SectionTitle icon="calendar-outline" title="Key Dates" />
        <Pressable
          onPress={() => setHearingSheetOpen(true)}
          style={[styles.nextHearing, { backgroundColor: hasUpcoming ? colors.surfaceAlt : colors.background, borderRadius: radius.md, padding: spacing.sm }]}
        >
          <View style={[styles.iconBox, { backgroundColor: colors.brand }]}>
            <Ionicons name="hammer-outline" size={18} color="#FFFFFF" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.pillText, { color: colors.textSecondary }]}>NEXT HEARING</Text>
            <Text style={[typography.bodyStrong, { color: hasUpcoming ? colors.textPrimary : colors.textSecondary }]}>
              {hasUpcoming ? formatHearingDate(caseDetail.next_hearing_at!) : "Not scheduled"}
            </Text>
          </View>
          <Text style={[typography.label, { color: colors.brand }]}>{hasUpcoming ? "Change ›" : "Schedule ›"}</Text>
        </Pressable>
        {hearingSheetOpen ? (
          <NextHearingSheet
            caseId={caseDetail.id}
            caseTitle={caseDetail.title}
            current={hasUpcoming ? caseDetail.next_hearing_at : null}
            onClose={() => setHearingSheetOpen(false)}
            onSaved={onUpdated}
          />
        ) : null}
        <View style={[styles.dateGrid, { marginTop: spacing.sm, gap: spacing.sm }]}>
          <DateTile label="Filed on" value={formatDay(caseDetail.filing_date)} />
          <DateTile label="Registered on" value={formatDay(caseDetail.registration_date)} />
        </View>
      </View>

      {/* Details */}
      <View style={card}>
        <SectionTitle icon="business-outline" title="Case Details" />
        <DetailRow label="Court" value={caseDetail.court} />
        <DetailRow label="Bench" value={caseDetail.bench} />
        <DetailRow label="Case type" value={caseDetail.case_type} />
        <DetailRow label="Opposite party" value={caseDetail.opposite_party} />
        <DetailRow
          label={`Total fees agreed${expenses > 0 ? " + expenses" : ""}`}
          value={caseDetail.agreed_fee !== null ? formatINR(Number(caseDetail.agreed_fee) + expenses) : null}
          last
        />
      </View>

      {caseDetail.description ? (
        <View style={card}>
          <SectionTitle icon="reader-outline" title="Summary" />
          <Text style={[typography.body, { color: colors.textPrimary, lineHeight: 22 }]}>{caseDetail.description}</Text>
        </View>
      ) : null}

      {caseDetail.internal_notes ? (
        <View style={card}>
          <SectionTitle icon="lock-closed-outline" title="Internal Notes" />
          <Text style={[typography.body, { color: colors.textPrimary, lineHeight: 22 }]}>{caseDetail.internal_notes}</Text>
        </View>
      ) : null}

      {/* Documents */}
      <View style={card}>
        <View style={styles.rowBetween}>
          <SectionTitle icon="documents-outline" title={`Documents${documents?.length ? ` (${documents.length})` : ""}`} />
          <Pressable
            onPress={handleUpload}
            disabled={isUploading}
            style={[styles.uploadButton, { backgroundColor: colors.brand, borderRadius: radius.pill }]}
            accessibilityLabel="Upload document"
          >
            {isUploading ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Ionicons name="cloud-upload-outline" size={16} color="#FFFFFF" />}
            <Text style={[typography.label, { color: "#FFFFFF" }]}>Upload</Text>
          </Pressable>
        </View>
        {documents === null ? (
          <ActivityIndicator color={colors.brand} style={{ marginTop: spacing.sm }} />
        ) : documents.length === 0 ? (
          <Text style={[typography.body, { color: colors.textSecondary, marginTop: spacing.xs }]}>
            No documents yet. Upload pleadings, orders or evidence for this case.
          </Text>
        ) : (
          <View style={{ gap: spacing.sm, marginTop: spacing.xs }}>
            {documents.map((doc) => (
              <Pressable
                key={doc.id}
                onPress={() => openDocument(doc)}
                style={({ pressed }) => [
                  styles.docRow,
                  { backgroundColor: colors.background, borderRadius: radius.md, padding: spacing.sm, opacity: pressed ? 0.7 : 1 },
                ]}
              >
                <View style={[styles.iconBox, { backgroundColor: colors.surfaceAlt }]}>
                  <Ionicons name={fileIcon(doc)} size={18} color={colors.brand} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[typography.bodyStrong, { color: colors.textPrimary }]} numberOfLines={1}>
                    {doc.file_name}
                  </Text>
                  <Text style={[typography.caption, { color: colors.textSecondary }]}>
                    {[
                      new Date(doc.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }),
                      fileSize(doc.file_size),
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </Text>
                </View>
                <Pressable onPress={() => confirmDelete(doc)} hitSlop={10} accessibilityLabel={`Delete ${doc.file_name}`}>
                  <Ionicons name="trash-outline" size={18} color={colors.danger} />
                </Pressable>
              </Pressable>
            ))}
          </View>
        )}
      </View>
    </ScrollView>
  );
}

function CaseEditForm({ caseDetail, onCancel, onSaved }: { caseDetail: CaseDetail; onCancel: () => void; onSaved: () => void }) {
  const { colors, spacing, radius, typography } = useTheme();
  const [title, setTitle] = useState(caseDetail.title);
  const [caseNumber, setCaseNumber] = useState(caseDetail.case_number ?? "");
  const [caseType, setCaseType] = useState(caseDetail.case_type ?? "");
  const [court, setCourt] = useState(caseDetail.court ?? "");
  const [bench, setBench] = useState(caseDetail.bench ?? "");
  const [oppositeParty, setOppositeParty] = useState(caseDetail.opposite_party ?? "");
  const [priority, setPriority] = useState<CasePriority>(caseDetail.priority);
  const [filingDate, setFilingDate] = useState(fromDateOnly(caseDetail.filing_date));
  const [registrationDate, setRegistrationDate] = useState(fromDateOnly(caseDetail.registration_date));
  const [description, setDescription] = useState(caseDetail.description ?? "");
  const [notes, setNotes] = useState(caseDetail.internal_notes ?? "");
  const [agreedFee, setAgreedFee] = useState(caseDetail.agreed_fee !== null ? String(Number(caseDetail.agreed_fee)) : "");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [touched, setTouched] = useState<{ title?: boolean; caseNumber?: boolean; agreedFee?: boolean }>({});

  const titleErr = touched.title && !title.trim() ? "Case title is required" : null;
  const caseNumberErr = touched.caseNumber ? caseNumberError(caseNumber) : null;
  const agreedFeeErr =
    touched.agreedFee && agreedFee.trim() && (Number.isNaN(Number(agreedFee)) || Number(agreedFee) < 0)
      ? "Enter a valid amount"
      : null;

  const save = async () => {
    setTouched({ title: true, caseNumber: true, agreedFee: true });
    if (!title.trim()) return setError("Case title is required");
    if (caseNumberError(caseNumber)) return setError("Case number: use the format NUMBER/YEAR, e.g. 482/2024");
    const fee = agreedFee.trim() ? Number(agreedFee) : null;
    if (fee !== null && (Number.isNaN(fee) || fee < 0)) return setError("Total fees agreed: enter a valid amount");
    if (filingDate && registrationDate && registrationDate < filingDate) {
      return setError("Registration date can't be before the filing date");
    }
    setError(null);
    setIsSaving(true);
    const caseNumberValue = caseNumber.trim() ? normalizeCaseNumber(caseNumber) ?? caseNumber.trim() : "";
    try {
      await updateCase(caseDetail.id, {
        title,
        caseNumber: caseNumberValue || null,
        caseType: caseType.trim() || null,
        court: court.trim() || null,
        bench: bench.trim() || null,
        oppositeParty: oppositeParty.trim() || null,
        agreedFee: fee,
        priority,
        filingDate: toDateOnly(filingDate),
        registrationDate: toDateOnly(registrationDate),
        description: description.trim() || null,
        internalNotes: notes.trim() || null,
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsSaving(false);
    }
  };

  const card = [styles.card, { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md }];

  return (
    <ScrollView
      contentContainerStyle={{ padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xxl }}
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets
    >
      <View style={card}>
        <SectionTitle icon="folder-open-outline" title="Case" />
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
          placeholder="e.g. 482/2024"
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
        <TextField label="Opposite party" placeholder="e.g. Suresh Traders" value={oppositeParty} onChangeText={setOppositeParty} />
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
      </View>

      <View style={card}>
        <SectionTitle icon="business-outline" title="Court & Dates" />
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
        <DateField label="Filing date" value={filingDate} onChange={setFilingDate} maximumDate={new Date()} placeholder="Not set" optional />
        <DateField
          label="Registration date"
          value={registrationDate}
          onChange={setRegistrationDate}
          minimumDate={filingDate ?? undefined}
          maximumDate={new Date()}
          placeholder="Not set"
          optional
        />
      </View>

      <View style={card}>
        <SectionTitle icon="reader-outline" title="Summary & Notes" />
        <TextField label="Summary" placeholder="e.g. Brief facts of the case" value={description} onChangeText={setDescription} multiline />
        <TextField
          label="Internal notes (private)"
          placeholder="e.g. Client prefers WhatsApp updates"
          value={notes}
          onChangeText={setNotes}
          multiline
        />
      </View>

      {error ? <Text style={[typography.body, { color: colors.danger }]}>{error}</Text> : null}
      <Button label="Save changes" onPress={save} loading={isSaving} pill />
      <Button label="Cancel" variant="ghost" onPress={onCancel} />
    </ScrollView>
  );
}

function SectionTitle({ icon, title }: { icon: keyof typeof Ionicons.glyphMap; title: string }) {
  const { colors, spacing, typography } = useTheme();
  return (
    <View style={[styles.sectionTitle, { marginBottom: spacing.sm }]}>
      <Ionicons name={icon} size={18} color={colors.accent} />
      <Text style={[typography.subtitle, { color: colors.brand }]}>{title}</Text>
    </View>
  );
}

function DetailRow({ label, value, last }: { label: string; value: string | null; last?: boolean }) {
  const { colors, typography } = useTheme();
  return (
    <View style={[styles.detailRow, { borderBottomColor: colors.border, borderBottomWidth: last ? 0 : StyleSheet.hairlineWidth }]}>
      <Text style={[typography.caption, { color: colors.textSecondary, width: 110 }]}>{label}</Text>
      <Text style={[typography.body, { color: value ? colors.textPrimary : colors.textSecondary, flex: 1, textAlign: "right" }]}>
        {value ?? "—"}
      </Text>
    </View>
  );
}

function DateTile({ label, value }: { label: string; value: string | null }) {
  const { colors, radius, typography } = useTheme();
  return (
    <View style={[styles.dateTile, { backgroundColor: colors.background, borderRadius: radius.md }]}>
      <Text style={[styles.pillText, { color: colors.textSecondary }]}>{label.toUpperCase()}</Text>
      <Text style={[typography.bodyStrong, { color: value ? colors.textPrimary : colors.textSecondary }]}>{value ?? "—"}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    shadowColor: "#0F172A",
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  pillText: { fontSize: 10, fontWeight: "700", letterSpacing: 0.6 },
  sectionTitle: { flexDirection: "row", alignItems: "center", gap: 8 },
  nextHearing: { flexDirection: "row", alignItems: "center", gap: 10 },
  iconBox: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  dateGrid: { flexDirection: "row" },
  dateTile: { flex: 1, padding: 10, gap: 2 },
  detailRow: { flexDirection: "row", alignItems: "center", paddingVertical: 10, gap: 8 },
  uploadButton: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 7 },
  docRow: { flexDirection: "row", alignItems: "center", gap: 10 },
});
