import { router, Stack, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import {
  getTransaction,
  INCOME_CATEGORIES,
  PAYMENT_METHODS,
  recordPartialPayment,
  TransactionDetail,
  updateTransactionCategory,
} from "@/features/transactions/api";
import { PickedReceipt, ReceiptPicker } from "@/shared/ui/ReceiptPicker";
import { formatINR } from "@/shared/lib/format";
import { Button } from "@/shared/ui/Button";
import { ScreenContainer } from "@/shared/ui/ScreenContainer";
import { SegmentedControl } from "@/shared/ui/SegmentedControl";
import { SelectField } from "@/shared/ui/SelectField";
import { TextField } from "@/shared/ui/TextField";
import { useTheme } from "@/shared/ui/theme";

/**
 * Edit a pending fee: change its category, or mark it (fully or partly)
 * received — with how it was paid and a receipt / screenshot. Anything
 * already received opens the read-only details page instead.
 */
export default function EditPendingPaymentScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors, spacing, radius, typography } = useTheme();

  const [tx, setTx] = useState<TransactionDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState<"pending" | "received">("pending");
  const [amountReceived, setAmountReceived] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<PickedReceipt | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [amountTouched, setAmountTouched] = useState(false);

  useEffect(() => {
    getTransaction(id)
      .then((t) => {
        if (t.status !== "pending" || t.type !== "income") {
          router.replace(`/(app)/transactions/${t.id}`);
          return;
        }
        setTx(t);
        setCategory(t.category);
        setAmountReceived(String(Number(t.amount)));
        setPaymentMethod(t.payment_method);
      })
      .catch((err) => setLoadError(err instanceof Error ? err.message : "Couldn't load this entry"));
  }, [id]);

  if (!tx) {
    return (
      <ScreenContainer style={{ alignItems: "center", justifyContent: "center" }}>
        <Stack.Screen options={{ title: "Edit payment" }} />
        {loadError ? <Text style={{ color: colors.danger }}>{loadError}</Text> : <ActivityIndicator color={colors.brand} />}
      </ScreenContainer>
    );
  }

  const pendingAmount = Number(tx.amount);
  const received = Number(amountReceived) || 0;
  const remaining = Math.max(pendingAmount - received, 0);
  const categories = INCOME_CATEGORIES.includes(tx.category) ? INCOME_CATEGORIES : [tx.category, ...INCOME_CATEGORIES];
  const amountError =
    status === "received" && amountTouched
      ? !amountReceived.trim() || Number.isNaN(received) || received <= 0
        ? "Enter the amount received"
        : received > pendingAmount
          ? `Can't be more than the pending ${formatINR(pendingAmount)}`
          : null
      : null;

  const handleSave = async () => {
    setAmountTouched(true);
    if (status === "received") {
      if (!amountReceived.trim() || Number.isNaN(received) || received <= 0) return setError("Enter the amount received");
      if (received > pendingAmount) return setError(`Can't be more than the pending ${formatINR(pendingAmount)}`);
    }
    setError(null);
    setIsSubmitting(true);
    try {
      if (category !== tx.category) await updateTransactionCategory(tx.id, category);
      if (status === "received") await recordPartialPayment(tx.id, received, { paymentMethod, receipt });
      router.back();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsSubmitting(false);
    }
  };

  const who = [tx.clients?.full_name, tx.cases?.title].filter(Boolean).join(" · ");

  return (
    <ScreenContainer scroll>
      <Stack.Screen options={{ title: "Edit payment" }} />

      <View style={[styles.summary, { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.lg }]}>
        <Text style={[typography.caption, { color: colors.textSecondary }]}>{who || "Pending fee"}</Text>
        <Text style={[typography.title, { color: colors.warning, marginTop: 2 }]}>{formatINR(pendingAmount)}</Text>
        <Text style={[typography.caption, { color: colors.textSecondary }]}>Pending</Text>
      </View>

      <SelectField
        label="Category"
        icon="pricetag-outline"
        value={category}
        options={categories.map((c) => ({ value: c, label: c }))}
        onChange={setCategory}
      />

      <Text style={[typography.label, { color: colors.textSecondary, marginBottom: spacing.xs }]}>Status</Text>
      <SegmentedControl
        segments={[
          { key: "pending", label: "Pending" },
          { key: "received", label: "Received" },
        ]}
        value={status}
        onChange={(key) => {
          setStatus(key as "pending" | "received");
          setError(null);
        }}
      />

      {status === "received" ? (
        <>
          <TextField
            label="Amount received (₹)"
            placeholder="e.g. 5000"
            value={amountReceived}
            onChangeText={setAmountReceived}
            onBlur={() => setAmountTouched(true)}
            keyboardType="decimal-pad"
            error={amountError ?? undefined}
          />
          {received > 0 && remaining > 0 ? (
            <Text style={[typography.caption, { color: colors.warning, marginTop: -spacing.sm, marginBottom: spacing.md }]}>
              {formatINR(remaining)} will stay pending
            </Text>
          ) : null}
          <SelectField
            label="Payment method"
            icon="wallet-outline"
            placeholder="Select payment method (optional)"
            value={paymentMethod}
            options={PAYMENT_METHODS.map((m) => ({ value: m, label: m }))}
            onChange={setPaymentMethod}
          />
          <ReceiptPicker value={receipt} onChange={setReceipt} />
        </>
      ) : null}

      {error ? <Text style={[typography.body, { color: colors.danger, marginBottom: spacing.md }]}>{error}</Text> : null}

      <Button label={status === "received" ? "Record payment" : "Save changes"} onPress={handleSave} loading={isSubmitting} pill />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  summary: { alignItems: "center" },
});
