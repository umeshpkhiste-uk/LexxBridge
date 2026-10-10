import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { CaseSummary, listCases, updateCase } from "@/features/cases/api";
import { createTransaction, EXPENSE_CATEGORIES, INCOME_CATEGORIES, PAYMENT_METHODS, TransactionType } from "@/features/transactions/api";
import { ReceiptPicker } from "@/shared/ui/ReceiptPicker";
import { Button } from "@/shared/ui/Button";
import { ScreenContainer } from "@/shared/ui/ScreenContainer";
import { SegmentedControl } from "@/shared/ui/SegmentedControl";
import { SelectField } from "@/shared/ui/SelectField";
import { TextField } from "@/shared/ui/TextField";
import { formatINR } from "@/shared/lib/format";
import { useTheme } from "@/shared/ui/theme";

const PAYMENT_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  Cash: "cash-outline",
  UPI: "phone-portrait-outline",
  "Bank transfer (NEFT/RTGS/IMPS)": "business-outline",
  Cheque: "document-text-outline",
  Card: "card-outline",
  "Demand draft": "reader-outline",
  Other: "ellipsis-horizontal-circle-outline",
};

export default function NewTransactionScreen() {
  const { caseId, clientId } = useLocalSearchParams<{ caseId?: string; clientId?: string }>();
  const { colors, spacing, radius, typography } = useTheme();

  const [type, setType] = useState<TransactionType>("income");
  const [category, setCategory] = useState(INCOME_CATEGORIES[0]);
  const [amount, setAmount] = useState("");
  const [cases, setCases] = useState<CaseSummary[]>([]);
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(caseId ?? null);
  const [feeDraft, setFeeDraft] = useState("");
  const [isEditingFee, setIsEditingFee] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<{ uri: string; mimeType: string } | null>(null);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [touched, setTouched] = useState<{ amount?: boolean; fee?: boolean }>({});

  const categories = type === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  const selectedCase = cases.find((c) => c.id === selectedCaseId) ?? null;
  const currentFee = selectedCase?.agreed_fee === null || selectedCase?.agreed_fee === undefined ? null : Number(selectedCase.agreed_fee);
  const amountFormatError =
    touched.amount && amount.trim() && (Number.isNaN(Number(amount)) || Number(amount) <= 0) ? "Enter a valid amount" : null;
  const feeFormatError =
    touched.fee && feeDraft.trim() && (Number.isNaN(Number(feeDraft)) || Number(feeDraft) < 0) ? "Enter a valid total fee" : null;

  // The client's cases: to pick which case a payment is for, and to read and
  // update that case's agreed total fees.
  useEffect(() => {
    if (!clientId && !caseId) return;
    listCases(clientId ? { clientId, includeArchived: true } : {})
      .then((rows) => {
        setCases(rows);
        setSelectedCaseId((prev) => prev ?? rows[0]?.id ?? null);
      })
      .catch(() => {});
  }, [clientId, caseId]);

  const selectCase = (id: string) => {
    setSelectedCaseId(id);
    setIsEditingFee(false);
    setFeeDraft("");
  };

  const startEditingFee = () => {
    setFeeDraft(currentFee !== null ? String(currentFee) : "");
    setIsEditingFee(true);
  };

  const handleTypeChange = (nextType: TransactionType) => {
    setType(nextType);
    setCategory(nextType === "income" ? INCOME_CATEGORIES[0] : EXPENSE_CATEGORIES[0]);
  };

  const handleSave = async () => {
    setTouched({ amount: true, fee: true });
    const feeEditing = type === "income" && !!selectedCase && (isEditingFee || currentFee === null) && feeDraft.trim() !== "";
    const feeValue = feeEditing ? Number(feeDraft) : null;
    if (feeEditing && (Number.isNaN(feeValue) || (feeValue ?? 0) < 0)) {
      setError("Total fees agreed: enter a valid amount");
      return;
    }
    const feeChanged = feeEditing && feeValue !== currentFee;
    const amountValue = Number(amount);
    const hasAmount = amount.trim() !== "";
    if (!hasAmount && !feeChanged) {
      setError(type === "income" ? "Enter the amount received" : "Enter the amount");
      return;
    }
    if (hasAmount && (Number.isNaN(amountValue) || amountValue <= 0)) {
      setError("Amount: enter a valid amount");
      return;
    }
    setError(null);
    setIsSubmitting(true);
    try {
      if (feeChanged && selectedCase) await updateCase(selectedCase.id, { agreedFee: feeValue });
      if (hasAmount) {
        await createTransaction({
          caseId: selectedCaseId ?? undefined,
          clientId: clientId ?? selectedCase?.client_id,
          type,
          category,
          amount: amountValue,
          // Income is always money received; what's still due comes from the total fees.
          status: "completed",
          paymentMethod: paymentMethod ?? undefined,
          notes,
          receipt,
        });
      }
      router.back();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ScreenContainer scroll>
      <SegmentedControl
        segments={[
          { key: "income", label: "Income" },
          { key: "expense", label: "Expense" },
        ]}
        value={type}
        onChange={(key) => handleTypeChange(key as TransactionType)}
      />

      <SelectField
        label="Category"
        icon="pricetag-outline"
        value={category}
        options={categories.map((c) => ({ value: c, label: c }))}
        onChange={setCategory}
      />

      {!caseId && cases.length > 1 ? (
        <SelectField
          label="Case"
          icon="briefcase-outline"
          value={selectedCaseId}
          options={cases.map((c) => ({ value: c.id, label: c.title }))}
          onChange={selectCase}
        />
      ) : null}

      {type === "income" && selectedCase ? (
        <View style={{ marginBottom: spacing.md }}>
          <Text style={[typography.label, { color: colors.textSecondary, marginBottom: spacing.xs }]}>
            Total fees agreed (₹){cases.length > 1 && !caseId ? "" : ` · ${selectedCase.title}`}
          </Text>
          {isEditingFee || currentFee === null ? (
            <View
              style={[
                styles.feeRow,
                { borderColor: colors.brand, borderRadius: radius.lg, backgroundColor: colors.surface, paddingHorizontal: spacing.md },
              ]}
            >
              <Ionicons name="cash-outline" size={20} color={colors.brand} />
              <TextInput
                value={feeDraft}
                onChangeText={setFeeDraft}
                onBlur={() => setTouched((t) => ({ ...t, fee: true }))}
                placeholder={currentFee === null ? "e.g. 25000" : "New total fees"}
                placeholderTextColor={colors.textSecondary}
                keyboardType="decimal-pad"
                autoFocus={isEditingFee}
                style={[typography.body, { flex: 1, color: colors.textPrimary, height: 52 }]}
              />
              {isEditingFee ? (
                <Pressable onPress={() => setIsEditingFee(false)} hitSlop={10} accessibilityLabel="Cancel editing total fees">
                  <Ionicons name="close-circle" size={20} color={colors.textSecondary} />
                </Pressable>
              ) : null}
            </View>
          ) : null}
          {feeFormatError ? (
            <Text style={[typography.caption, { color: colors.danger, marginTop: spacing.xs }]}>{feeFormatError}</Text>
          ) : !(isEditingFee || currentFee === null) ? (
            <View
              style={[
                styles.feeRow,
                { borderColor: colors.border, borderRadius: radius.lg, backgroundColor: colors.surfaceAlt, paddingHorizontal: spacing.md },
              ]}
              accessibilityLabel={`Total fees ${formatINR(currentFee)}, locked`}
            >
              <Ionicons name="lock-closed-outline" size={18} color={colors.textSecondary} />
              <Text style={[typography.bodyStrong, { flex: 1, color: colors.textSecondary }]}>{formatINR(currentFee)}</Text>
              <Pressable onPress={startEditingFee} hitSlop={10} style={styles.feeEdit} accessibilityLabel="Edit total fees">
                <Ionicons name="create-outline" size={18} color={colors.brand} />
                <Text style={[typography.label, { color: colors.brand }]}>Edit</Text>
              </Pressable>
            </View>
          ) : null}
          <Text style={[typography.caption, { color: colors.textSecondary, marginTop: 4 }]}>
            {currentFee === null
              ? "The full fee for this case. Pending = total fees − amount received."
              : isEditingFee
                ? "Changing this updates the case's total fees."
                : "Locked. Tap Edit to change it, for example if the fee goes up."}
          </Text>
        </View>
      ) : null}

      <TextField
        label={type === "income" ? "Amount received (₹)" : "Amount (₹)"}
        placeholder="e.g. 5000"
        value={amount}
        onChangeText={setAmount}
        onBlur={() => setTouched((t) => ({ ...t, amount: true }))}
        keyboardType="decimal-pad"
        error={amountFormatError ?? undefined}
      />

      <SelectField
        label="Payment method"
        icon="wallet-outline"
        placeholder="Select payment method (optional)"
        value={paymentMethod}
        options={PAYMENT_METHODS.map((m) => ({ value: m, label: m, icon: PAYMENT_ICONS[m] }))}
        onChange={setPaymentMethod}
      />

      <ReceiptPicker value={receipt} onChange={setReceipt} />

      <TextField label="Notes" placeholder="e.g. Paid via UPI, receipt shared on WhatsApp" value={notes} onChangeText={setNotes} multiline />

      {error ? <Text style={[typography.body, { color: colors.danger, marginBottom: spacing.md }]}>{error}</Text> : null}

      <Button label="Save transaction" onPress={handleSave} loading={isSubmitting} pill />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  feeRow: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 52, borderWidth: StyleSheet.hairlineWidth * 2 },
  feeEdit: { flexDirection: "row", alignItems: "center", gap: 4 },
});
