import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  deleteTransaction,
  EXPENSE_CATEGORIES,
  getReceiptUrl,
  getTransaction,
  INCOME_CATEGORIES,
  PAYMENT_METHODS,
  TransactionDetail,
  updateTransaction,
} from "@/features/transactions/api";
import { confirmAsync } from "@/shared/lib/confirm";
import { formatINR } from "@/shared/lib/format";
import { fromDateOnly } from "@/shared/lib/dateInput";
import { Button } from "@/shared/ui/Button";
import { DateField } from "@/shared/ui/DateField";
import { SelectField } from "@/shared/ui/SelectField";
import { TextField } from "@/shared/ui/TextField";
import { useTheme } from "@/shared/ui/theme";

function formatDay(dateStr: string) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "long", year: "numeric" });
}

/** Details of a transaction, including its receipt / screenshot. Every
 * field but the linked client/case can be corrected after the fact — e.g. a
 * mistyped amount. Pending fees open the "receive payment" page instead. */
export default function TransactionDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors, spacing, radius, typography } = useTheme();
  const insets = useSafeAreaInsets();
  const [tx, setTx] = useState<TransactionDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);
  const [viewerOpen, setViewerOpen] = useState(false);

  const [isEditing, setIsEditing] = useState(false);
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("");
  const [date, setDate] = useState<Date | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<string | null>(null);
  const [referenceNumber, setReferenceNumber] = useState("");
  const [notes, setNotes] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [amountTouched, setAmountTouched] = useState(false);

  useEffect(() => {
    getTransaction(id)
      .then((t) => {
        if (t.type === "income" && t.status === "pending") {
          router.replace(`/(app)/transactions/receive?id=${t.id}`);
          return;
        }
        setTx(t);
        if (t.receipt_path) getReceiptUrl(t.receipt_path).then(setReceiptUrl).catch(() => {});
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Couldn't load this entry"));
  }, [id]);

  if (!tx) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Stack.Screen options={{ title: "Payment details" }} />
        {error ? <Text style={{ color: colors.danger }}>{error}</Text> : <ActivityIndicator color={colors.brand} />}
      </View>
    );
  }

  const isExpense = tx.type === "expense";
  const tone = isExpense ? colors.danger : colors.success;
  const categories = isExpense ? EXPENSE_CATEGORIES : INCOME_CATEGORIES;

  const startEditing = () => {
    setAmount(String(tx.amount));
    setCategory(tx.category);
    setDate(fromDateOnly(tx.transaction_date));
    setPaymentMethod(tx.payment_method);
    setReferenceNumber(tx.reference_number ?? "");
    setNotes(tx.notes ?? "");
    setError(null);
    setAmountTouched(false);
    setIsEditing(true);
  };

  const amountFormatError =
    amountTouched && (!amount.trim() || Number.isNaN(Number(amount)) || Number(amount) <= 0) ? "Enter a valid amount" : null;

  const saveEdit = async () => {
    setAmountTouched(true);
    const amountValue = Number(amount);
    if (!amount.trim() || Number.isNaN(amountValue) || amountValue <= 0) {
      setError("Amount: enter a valid amount");
      return;
    }
    if (!date) {
      setError("Select a date");
      return;
    }
    setError(null);
    setIsSaving(true);
    try {
      const updated = await updateTransaction(tx.id, {
        category,
        amount: amountValue,
        transactionDate: date,
        paymentMethod,
        referenceNumber,
        notes,
      });
      setTx({ ...tx, ...updated });
      setIsEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save changes");
    } finally {
      setIsSaving(false);
    }
  };

  const confirmDelete = async () => {
    const confirmed = await confirmAsync(
      "Delete this entry?",
      "This removes it permanently, along with its receipt if one was attached. This can't be undone.",
      "Delete"
    );
    if (!confirmed) return;
    setIsDeleting(true);
    try {
      await deleteTransaction(tx);
      router.back();
    } catch (err) {
      setIsDeleting(false);
      Alert.alert("Couldn't delete entry", err instanceof Error ? err.message : "Something went wrong");
    }
  };

  const rows: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string | null }[] = [
    { icon: "person-outline", label: "Client", value: tx.clients?.full_name ?? null },
    { icon: "briefcase-outline", label: "Case", value: tx.cases?.title ?? null },
  ];

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={{ padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xxl }}>
      <Stack.Screen
        options={{
          title: isExpense ? "Expense details" : "Payment details",
          headerRight: () =>
            isEditing ? (
              <Pressable
                onPress={() => setIsEditing(false)}
                hitSlop={10}
                accessibilityLabel="Cancel editing"
                style={{ paddingRight: spacing.sm }}
              >
                <Text style={[typography.body, { color: colors.textSecondary }]}>Cancel</Text>
              </Pressable>
            ) : (
              <View style={[styles.headerActions, { paddingRight: spacing.sm }]}>
                <Pressable onPress={startEditing} hitSlop={10} accessibilityLabel="Edit entry" disabled={isDeleting}>
                  <Ionicons name="create-outline" size={22} color={colors.brand} />
                </Pressable>
                <Pressable onPress={confirmDelete} hitSlop={10} accessibilityLabel="Delete entry" disabled={isDeleting}>
                  {isDeleting ? <ActivityIndicator size="small" color={colors.danger} /> : <Ionicons name="trash-outline" size={22} color={colors.danger} />}
                </Pressable>
              </View>
            ),
        }}
      />

      <View style={[styles.card, styles.hero, { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg }]}>
        <View style={[styles.badge, { backgroundColor: `${tone}1F` }]}>
          <Ionicons name={isExpense ? "arrow-up" : "checkmark-circle"} size={14} color={tone} />
          <Text style={[typography.label, { color: tone }]}>{isExpense ? "Expense" : "Received"}</Text>
        </View>
        {isEditing ? (
          <>
            <View
              style={[
                styles.amountEdit,
                { borderColor: amountFormatError ? colors.danger : colors.brand, borderRadius: radius.md, marginTop: spacing.sm },
              ]}
            >
              <Text style={[typography.display, { color: tone, fontSize: 28 }]}>{isExpense ? "−₹" : "₹"}</Text>
              <TextInput
                value={amount}
                onChangeText={setAmount}
                onBlur={() => setAmountTouched(true)}
                placeholder="e.g. 5000"
                keyboardType="decimal-pad"
                autoFocus
                style={[typography.display, { color: tone, fontSize: 28, flex: 1 }]}
              />
            </View>
            {amountFormatError ? (
              <Text style={[typography.caption, { color: colors.danger, marginTop: spacing.xs }]}>{amountFormatError}</Text>
            ) : null}
          </>
        ) : (
          <Text style={[typography.display, { color: tone, fontSize: 34, marginTop: spacing.sm }]}>
            {isExpense ? "−" : ""}
            {formatINR(Number(tx.amount))}
          </Text>
        )}
      </View>

      {isEditing ? (
        <View style={[styles.card, { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md }]}>
          <SelectField label="Category" icon="pricetag-outline" value={category} options={categories.map((c) => ({ value: c, label: c }))} onChange={setCategory} />
          <DateField label={isExpense ? "Date" : "Received on"} value={date} onChange={setDate} maximumDate={new Date()} />
          <SelectField
            label="Payment method"
            icon="wallet-outline"
            placeholder="Select payment method (optional)"
            value={paymentMethod}
            options={PAYMENT_METHODS.map((m) => ({ value: m, label: m }))}
            onChange={setPaymentMethod}
          />
          <TextField label="Reference" placeholder="e.g. Cheque no. 452317" value={referenceNumber} onChangeText={setReferenceNumber} />
          <TextField label="Notes" placeholder="e.g. Paid via UPI" value={notes} onChangeText={setNotes} multiline />

          {error ? <Text style={{ color: colors.danger, marginBottom: spacing.sm }}>{error}</Text> : null}
          <Button label="Save changes" onPress={saveEdit} loading={isSaving} pill />
        </View>
      ) : (
        <View style={[styles.card, { backgroundColor: colors.surface, borderRadius: radius.lg, paddingHorizontal: spacing.md }]}>
          {[
            { icon: "pricetag-outline" as const, label: "Category", value: tx.category },
            { icon: "calendar-outline" as const, label: isExpense ? "Date" : "Received on", value: formatDay(tx.transaction_date) },
            ...rows,
            { icon: "wallet-outline" as const, label: "Payment method", value: tx.payment_method },
            { icon: "document-text-outline" as const, label: "Reference", value: tx.reference_number },
            { icon: "reader-outline" as const, label: "Notes", value: tx.notes },
          ]
            .filter((r) => r.value)
            .map((r, i) => (
              <View key={r.label} style={[styles.row, { borderTopColor: colors.border, borderTopWidth: i ? StyleSheet.hairlineWidth : 0 }]}>
                <Ionicons name={r.icon} size={18} color={colors.textSecondary} />
                <Text style={[typography.body, { color: colors.textSecondary, width: 120 }]}>{r.label}</Text>
                <Text style={[typography.bodyStrong, { color: colors.textPrimary, flex: 1, textAlign: "right" }]}>{r.value}</Text>
              </View>
            ))}
        </View>
      )}

      {!isEditing ? (
        <View style={[styles.card, { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md }]}>
          <Text style={[typography.subtitle, { color: colors.textPrimary, marginBottom: spacing.sm }]}>Receipt / screenshot</Text>
          {!tx.receipt_path ? (
            <Text style={[typography.body, { color: colors.textSecondary }]}>No receipt was attached.</Text>
          ) : receiptUrl ? (
            <Pressable onPress={() => setViewerOpen(true)} accessibilityLabel="View receipt full screen">
              <Image source={{ uri: receiptUrl }} style={{ width: "100%", height: 260, borderRadius: radius.md }} contentFit="cover" transition={150} />
              <Text style={[typography.caption, { color: colors.brand, textAlign: "center", marginTop: spacing.xs }]}>Tap to view full screen</Text>
            </Pressable>
          ) : (
            <ActivityIndicator color={colors.brand} />
          )}
        </View>
      ) : null}

      <Modal visible={viewerOpen} transparent animationType="fade" onRequestClose={() => setViewerOpen(false)}>
        <Pressable style={styles.viewer} onPress={() => setViewerOpen(false)} accessibilityLabel="Close receipt">
          {receiptUrl ? <Image source={{ uri: receiptUrl }} style={{ width: "100%", height: "85%" }} contentFit="contain" /> : null}
          <View style={[styles.viewerClose, { top: insets.top + 12 }]}>
            <Ionicons name="close" size={28} color="#FFFFFF" />
          </View>
        </Pressable>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 16 },
  card: {
    shadowColor: "#0F172A",
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  hero: { alignItems: "center" },
  badge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  amountEdit: { flexDirection: "row", alignItems: "center", borderWidth: 1.5, paddingHorizontal: 12, minWidth: 180, justifyContent: "center" },
  row: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 14 },
  viewer: { flex: 1, backgroundColor: "rgba(0,0,0,0.95)", alignItems: "center", justifyContent: "center" },
  viewerClose: { position: "absolute", right: 20 },
});
