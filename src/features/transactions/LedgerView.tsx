import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CaseDetail, getCase, listCases } from "@/features/cases/api";
import { Client, getClient } from "@/features/clients/api";
import { getMyProfile } from "@/features/profile/api";
import { formatINR } from "@/shared/lib/format";
import { ActionSheet, SheetAction } from "@/shared/ui/ActionSheet";
import { Button } from "@/shared/ui/Button";
import { DateField, toDateOnly } from "@/shared/ui/DateField";
import { DonutChart } from "@/shared/ui/DonutChart";
import { useTheme } from "@/shared/ui/theme";
import { ClientTransaction, getReceiptUrl, listTransactionsForCase, listTransactionsForClient } from "./api";
import { computeFeeTotals } from "./feeTotals";
import { buildStatement, downloadStatementPdf, shareStatementViaWhatsApp, shareViaEmail, shareViaSms, shareViaSystem, StatementRange } from "./shareStatement";

type SharePeriod = { label: string; range?: StatementRange };

/** Inclusive first/last day of a "YYYY-MM" month key, as YYYY-MM-DD strings. */
function monthRange(monthKey: string): StatementRange {
  const [y, m] = monthKey.split("-").map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  return { from: `${monthKey}-01`, to: `${monthKey}-${String(lastDay).padStart(2, "0")}` };
}

type Filter = "all" | "received" | "pending" | "expenses";

type Props = {
  clientId: string;
  /** When set, only this case's transactions are shown. */
  caseId?: string;
  /** "screen" draws a full-bleed header with a back arrow; "embedded" is
   * for use inside another screen (e.g. the case Financials tab). */
  variant?: "screen" | "embedded";
};

function kindOf(t: ClientTransaction): Exclude<Filter, "all"> {
  if (t.type === "expense") return "expenses";
  return t.status === "pending" ? "pending" : "received";
}

function parseDay(dateStr: string) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function LedgerView({ clientId, caseId, variant = "screen" }: Props) {
  const { colors, spacing, radius, typography } = useTheme();
  const insets = useSafeAreaInsets();
  const [client, setClient] = useState<Client | null>(null);
  const [caseDetail, setCaseDetail] = useState<CaseDetail | null>(null);
  const [scopeCases, setScopeCases] = useState<{ id: string; title: string; case_number: string | null; agreed_fee: number | null }[]>([]);
  const [transactions, setTransactions] = useState<ClientTransaction[]>([]);
  const [advocate, setAdvocate] = useState<{ name: string | null; phone: string | null; address: string | null }>({
    name: null,
    phone: null,
    address: null,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [month, setMonth] = useState<string | null>(null);
  const [sheet, setSheet] = useState<"sharePeriod" | "shareMonth" | "shareChannel" | "month" | null>(null);
  const [sharePeriod, setSharePeriod] = useState<SharePeriod>({ label: "Complete transaction history" });
  const [customRangeOpen, setCustomRangeOpen] = useState(false);
  const [customFrom, setCustomFrom] = useState<Date | null>(null);
  const [customTo, setCustomTo] = useState<Date | null>(null);

  useFocusEffect(
    useCallback(() => {
      let isMounted = true;
      Promise.all([
        getClient(clientId),
        caseId ? getCase(caseId) : Promise.resolve(null),
        caseId ? listTransactionsForCase(caseId) : listTransactionsForClient(clientId),
        getMyProfile().catch(() => null),
        caseId ? Promise.resolve(null) : listCases({ clientId, includeArchived: true }),
      ])
        .then(([clientData, caseData, transactionData, profile, clientCases]) => {
          if (!isMounted) return;
          setClient(clientData);
          setCaseDetail(caseData);
          setScopeCases(caseData ? [caseData] : (clientCases ?? []));
          setTransactions(transactionData as ClientTransaction[]);
          setAdvocate({
            name: profile?.full_name ?? null,
            phone: profile?.phone ?? null,
            address: profile?.chamber_address ?? profile?.address_line ?? null,
          });
          setError(null);
        })
        .catch((err) => isMounted && setError(err instanceof Error ? err.message : "Something went wrong"))
        .finally(() => isMounted && setIsLoading(false));
      return () => {
        isMounted = false;
      };
    }, [clientId, caseId]),
  );

  const totals = useMemo(() => {
    const sum = (kind: Exclude<Filter, "all">) => transactions.filter((t) => kindOf(t) === kind).reduce((s, t) => s + Number(t.amount), 0);
    const count = (kind: Exclude<Filter, "all">) => transactions.filter((t) => kindOf(t) === kind).length;
    // Totals follow each case's agreed fee: pending = fee − received.
    const fees = computeFeeTotals(scopeCases, transactions);
    return {
      ...fees,
      pendingEntries: sum("pending"),
      counts: { all: transactions.length, received: count("received"), pending: count("pending"), expenses: count("expenses") },
    };
  }, [transactions, scopeCases]);

  const months = useMemo(() => [...new Set(transactions.map((t) => t.transaction_date.slice(0, 7)))].sort().reverse(), [transactions]);

  const groups = useMemo(() => {
    const query = search.trim().toLowerCase();
    const visible = transactions
      .filter((t) => filter === "all" || kindOf(t) === filter)
      .filter((t) => !month || t.transaction_date.startsWith(month))
      .filter(
        (t) =>
          !query ||
          [t.category, t.notes, t.reference_number, t.payment_method, t.cases?.title].some((f) => f?.toLowerCase().includes(query)),
      )
      .sort((a, b) => b.transaction_date.localeCompare(a.transaction_date));
    const byMonth = new Map<string, ClientTransaction[]>();
    for (const t of visible) {
      const key = t.transaction_date.slice(0, 7);
      if (!byMonth.has(key)) byMonth.set(key, []);
      byMonth.get(key)!.push(t);
    }
    return [...byMonth.entries()];
  }, [transactions, filter, month, search]);

  const monthLabel = (key: string) => parseDay(`${key}-01`).toLocaleDateString("en-IN", { month: "short", year: "numeric" });

  if (isLoading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.brand} />
      </View>
    );
  }
  if (error || !client) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background, padding: spacing.lg }]}>
        <Text style={{ color: colors.danger }}>{error ?? "Client not found"}</Text>
      </View>
    );
  }

  const statementInput = () => ({
    clientName: client.full_name,
    clientPhone: client.phone,
    clientEmail: client.email,
    clientAddress: client.address,
    caseTitle: caseDetail?.title,
    caseNumber: caseDetail?.case_number,
    caseType: caseDetail?.case_type,
    court: caseDetail?.court,
    oppositeParty: caseDetail?.opposite_party,
    filingDate: caseDetail?.filing_date,
    agreedFee: caseDetail?.agreed_fee,
    cases: caseDetail ? undefined : scopeCases.map((c) => ({ title: c.title, caseNumber: c.case_number, agreedFee: c.agreed_fee })),
    advocateName: advocate.name,
    advocatePhone: advocate.phone,
    advocateAddress: advocate.address,
    transactions,
    totals: { totalFees: totals.totalFees, received: totals.received, pending: totals.pending, expenses: totals.expenses },
    range: sharePeriod.range,
    periodLabel: sharePeriod.label,
  });
  const statement = () => buildStatement(statementInput());
  const subject = `Payment statement${caseDetail ? ` — ${caseDetail.title}` : ""}`;

  const choosePeriod = (period: SharePeriod) => {
    setSharePeriod(period);
    setSheet("shareChannel");
  };

  const currentMonthKey = new Date().toISOString().slice(0, 7);

  // Tapping the share icon asks what to include before which app to send it
  // through: the complete history, the current month, a past month, or a
  // custom range.
  const sharePeriodActions: SheetAction[] = [
    { label: "Complete transaction history", icon: "infinite-outline", onPress: () => choosePeriod({ label: "Complete transaction history" }) },
    { label: `This month (${monthLabel(currentMonthKey)})`, icon: "today-outline", onPress: () => choosePeriod({ label: monthLabel(currentMonthKey), range: monthRange(currentMonthKey) }) },
    ...(months.length ? [{ label: "Choose a month…", icon: "calendar-outline" as const, onPress: () => setSheet("shareMonth") }] : []),
    { label: "Custom date range…", icon: "options-outline", onPress: () => setCustomRangeOpen(true) },
  ];
  const shareMonthActions: SheetAction[] = months.map((m) => ({
    label: monthLabel(m),
    icon: "calendar-clear-outline",
    onPress: () => choosePeriod({ label: monthLabel(m), range: monthRange(m) }),
  }));
  const shareActions: SheetAction[] = [
    { label: "WhatsApp", icon: "logo-whatsapp", onPress: () => shareStatementViaWhatsApp(statementInput(), client.phone, subject) },
    {
      label: client.email ? `Email (${client.email})` : "Email",
      icon: "mail-outline",
      onPress: () => shareViaEmail(statement(), subject, client.email),
    },
    { label: "Text message (SMS)", icon: "chatbox-outline", onPress: () => shareViaSms(statement(), client.phone) },
    { label: "Download PDF", icon: "document-outline", onPress: () => downloadStatementPdf(statementInput(), subject) },
    { label: "More options…", icon: "share-social-outline", onPress: () => shareViaSystem(statement(), subject) },
  ];
  const monthActions: SheetAction[] = [
    { label: "All months", icon: "calendar-outline", onPress: () => setMonth(null) },
    ...months.map((m) => ({ label: monthLabel(m), icon: "calendar-clear-outline" as const, onPress: () => setMonth(m) })),
  ];

  const addTransaction = () =>
    router.push(
      caseDetail
        ? `/(app)/transactions/new?caseId=${caseDetail.id}&clientId=${client.id}`
        : `/(app)/transactions/new?clientId=${client.id}`,
    );

  const billed = totals.totalFees;
  // Fee-only portion of `billed` — the "Total agreed" legend entry is the
  // pure agreed fee (matching the case Overview tab exactly), not the
  // combined fees+expenses figure the card below shows.
  const agreedFeeOnly = billed - totals.expenses;
  const hasAgreedFee = scopeCases.some((c) => c.agreed_fee !== null);
  const isScreen = variant === "screen";
  const onHero = "#FFFFFF";
  const onHeroMuted = "rgba(255,255,255,0.75)";

  const FILTERS: { key: Filter; label: string; color: string }[] = [
    { key: "all", label: "All", color: colors.textPrimary },
    { key: "received", label: "Received", color: colors.success },
    { key: "pending", label: "Pending", color: colors.warning },
    { key: "expenses", label: "Expenses", color: colors.danger },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView contentContainerStyle={{ paddingBottom: spacing.xxl }} keyboardShouldPersistTaps="handled">
        {/* Header: who and which case this ledger is for. Embedded (client and
            case tabs) already show that above, so the card is only on the
            standalone screen. */}
        {isScreen ? (
          <View
            style={[
              {
                backgroundColor: colors.brand,
                paddingHorizontal: spacing.lg,
                paddingBottom: spacing.xl + spacing.lg,
                paddingTop: isScreen ? insets.top + spacing.sm : spacing.lg,
              },
              !isScreen && { margin: spacing.md, marginBottom: 0, borderRadius: radius.lg, paddingBottom: spacing.lg },
            ]}
          >
            <View style={styles.heroTop}>
              {isScreen ? (
                <Pressable
                  onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}
                  hitSlop={12}
                  accessibilityLabel="Go back"
                  style={styles.heroTitleRow}
                >
                  <Ionicons name="chevron-back" size={26} color={onHero} />
                  <Text style={[typography.title, { color: onHero }]}>Transactions</Text>
                </Pressable>
              ) : (
                <Text style={[typography.label, { color: onHeroMuted, textTransform: "uppercase" }]}>Transactions</Text>
              )}
              <View style={styles.heroActions}>
                <Pressable onPress={addTransaction} hitSlop={10} accessibilityLabel="Add transaction">
                  <Ionicons name="add-circle-outline" size={26} color={onHero} />
                </Pressable>
                <Pressable onPress={() => setSheet("sharePeriod")} hitSlop={10} accessibilityLabel="Share statement with client">
                  <Ionicons name="share-social-outline" size={24} color={onHero} />
                </Pressable>
              </View>
            </View>

            <View style={{ marginTop: spacing.lg }}>
              <Text style={[typography.caption, { color: onHeroMuted }]}>Client</Text>
              <Text style={[typography.title, { color: onHero }]} numberOfLines={1}>
                {client.full_name}
              </Text>
            </View>
            <View style={[styles.heroMeta, { marginTop: spacing.sm, gap: spacing.md }]}>
              {caseDetail ? (
                <Pressable onPress={() => router.push(`/(app)/cases/${caseDetail.id}`)} style={styles.metaItem}>
                  <Ionicons name="briefcase-outline" size={14} color={onHeroMuted} />
                  <Text style={[typography.caption, { color: onHero }]} numberOfLines={1}>
                    {caseDetail.title}
                    {caseDetail.case_number ? ` · ${caseDetail.case_number}` : ""}
                  </Text>
                </Pressable>
              ) : (
                <View style={styles.metaItem}>
                  <Ionicons name="folder-outline" size={14} color={onHeroMuted} />
                  <Text style={[typography.caption, { color: onHero }]}>All cases</Text>
                </View>
              )}
              {client.phone ? (
                <View style={styles.metaItem}>
                  <Ionicons name="call-outline" size={14} color={onHeroMuted} />
                  <Text style={[typography.caption, { color: onHero }]}>{client.phone}</Text>
                </View>
              ) : null}
            </View>
            {caseDetail?.court || caseDetail?.case_type ? (
              <Text style={[typography.caption, { color: onHeroMuted, marginTop: spacing.xs }]} numberOfLines={1}>
                {[caseDetail.case_type, caseDetail.court].filter(Boolean).join(" · ")}
              </Text>
            ) : null}
          </View>
        ) : null}

        {/* Donut: received vs pending, balance due in the centre */}
        <View
          style={[
            styles.card,
            {
              backgroundColor: colors.surface,
              borderRadius: radius.lg,
              marginHorizontal: spacing.md,
              marginTop: isScreen ? -spacing.xl : spacing.md,
              padding: spacing.lg,
            },
          ]}
        >
          <Text style={[typography.subtitle, { color: colors.textPrimary, marginBottom: spacing.md }]}>Transaction summary</Text>
          <View style={styles.donutRow}>
            <DonutChart
              size={164}
              strokeWidth={16}
              trackColor={colors.surfaceAlt}
              segments={[
                { value: totals.received, color: colors.success },
                // totals.pending already folds in expenses (see
                // feeTotals.ts) — split it back apart here so the two
                // slices don't double-count the same rupees.
                { value: totals.pending - totals.expenses, color: colors.warning },
                { value: totals.expenses, color: colors.danger },
              ]}
            >
              <Text style={[typography.caption, { color: colors.textSecondary }]}>Yet to receive</Text>
              <Text style={[typography.title, { color: totals.pending > 0 ? colors.warning : colors.success, fontSize: 20 }]}>
                {formatINR(totals.pending)}
              </Text>
              <Text style={[typography.caption, { color: colors.textSecondary }]}>
                {billed > 0 ? `${Math.round((totals.received / billed) * 100)}% paid` : "No fees yet"}
              </Text>
            </DonutChart>
            <View style={{ flex: 1, marginLeft: spacing.lg, gap: spacing.md }}>
              <Legend color={colors.brand} label="Total agreed" value={agreedFeeOnly} />
              <Legend color={colors.success} label="Received" value={totals.received} />
              {totals.expenses > 0 ? <Legend color={colors.danger} label="Expenses" value={totals.expenses} /> : null}
              <Legend color={colors.warning} label="Pending" value={totals.pending} note="(Agreed fees + expenses − Received)" />
            </View>
          </View>
          <View style={[styles.cardFooter, { marginTop: spacing.md, paddingTop: spacing.md, borderTopColor: colors.border }]}>
            <View style={{ flex: 1 }}>
              <Text style={[typography.caption, { color: colors.textSecondary }]}>
                Total{hasAgreedFee ? " (agreed fees" : " (fees"}
                {totals.expenses > 0 ? " + expenses)" : ")"}
              </Text>
              <Text style={[typography.title, { color: colors.brand, fontSize: 22 }]}>{formatINR(billed)}</Text>
              {!hasAgreedFee ? (
                <Text style={[typography.caption, { color: colors.textSecondary, fontSize: 11 }]}>
                  Set the agreed fee when adding a transaction
                </Text>
              ) : null}
            </View>
            {!isScreen ? (
              <View style={[styles.cardActions, { gap: spacing.sm }]}>
                <Pressable
                  onPress={addTransaction}
                  accessibilityLabel="Add transaction"
                  style={({ pressed }) => [styles.cardAction, { backgroundColor: colors.brand, opacity: pressed ? 0.85 : 1 }]}
                >
                  <Ionicons name="add" size={24} color={colors.textInverse} />
                </Pressable>
                <Pressable
                  onPress={() => setSheet("sharePeriod")}
                  accessibilityLabel="Share statement with client"
                  style={({ pressed }) => [
                    styles.cardAction,
                    {
                      backgroundColor: colors.surfaceAlt,
                      borderColor: colors.border,
                      borderWidth: StyleSheet.hairlineWidth,
                      opacity: pressed ? 0.85 : 1,
                    },
                  ]}
                >
                  <Ionicons name="share-social-outline" size={20} color={colors.brand} />
                </Pressable>
              </View>
            ) : null}
          </View>
        </View>

        {/* Search + month filter */}
        <View style={[styles.searchRow, { marginHorizontal: spacing.md, marginTop: spacing.lg, gap: spacing.sm }]}>
          <View
            style={[
              styles.search,
              { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md },
            ]}
          >
            <Ionicons name="search" size={18} color={colors.textSecondary} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search transactions…"
              placeholderTextColor={colors.textSecondary}
              style={[typography.body, { flex: 1, color: colors.textPrimary, paddingVertical: 12, marginLeft: spacing.sm }]}
              clearButtonMode="while-editing"
            />
          </View>
          <Pressable
            onPress={() => setSheet("month")}
            accessibilityLabel="Filter by month"
            style={[
              styles.calendarButton,
              { backgroundColor: month ? colors.brand : colors.surface, borderColor: colors.border, borderRadius: radius.md },
            ]}
          >
            <Ionicons name="calendar-outline" size={22} color={month ? colors.textInverse : colors.brand} />
          </Pressable>
        </View>

        {/* Counts double as filters */}
        <View
          style={[
            styles.counts,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
              borderRadius: radius.lg,
              marginHorizontal: spacing.md,
              marginTop: spacing.md,
            },
          ]}
        >
          {FILTERS.map((f) => {
            const selected = filter === f.key;
            return (
              <Pressable
                key={f.key}
                onPress={() => setFilter(f.key)}
                style={[
                  styles.countCell,
                  { borderRadius: radius.md, paddingVertical: spacing.sm, backgroundColor: selected ? colors.surfaceAlt : "transparent" },
                ]}
                accessibilityState={{ selected }}
              >
                <Text style={[typography.caption, { color: colors.textSecondary, textTransform: "uppercase", fontSize: 11 }]}>
                  {f.label}
                </Text>
                <Text style={[typography.subtitle, { color: f.color }]}>{totals.counts[f.key]}</Text>
              </Pressable>
            );
          })}
        </View>

        {/* Month-grouped list */}
        {month ? (
          <Text
            style={[typography.caption, { color: colors.brand, marginHorizontal: spacing.md, marginTop: spacing.md }]}
            onPress={() => setMonth(null)}
          >
            Showing {monthLabel(month)} only · Show all
          </Text>
        ) : null}

        {groups.length === 0 ? (
          <Text style={[typography.body, { color: colors.textSecondary, textAlign: "center", marginTop: spacing.xl }]}>
            {transactions.length === 0 ? "No transactions recorded yet. Tap + to add one." : "No transactions match."}
          </Text>
        ) : (
          groups.map(([key, items]) => (
            <View key={key} style={{ marginTop: spacing.lg }}>
              <View
                style={[
                  styles.monthHeader,
                  { backgroundColor: colors.surfaceAlt, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
                ]}
              >
                <Text style={[typography.bodyStrong, { color: colors.textPrimary }]}>{monthLabel(key)}</Text>
                <Text style={[typography.caption, { color: colors.textSecondary }]}>
                  {items.length} transaction{items.length > 1 ? "s" : ""}
                </Text>
              </View>
              {items.map((t) => (
                <TransactionRow key={t.id} item={t} showCase={!caseId} />
              ))}
            </View>
          ))
        )}
      </ScrollView>

      <ActionSheet
        visible={sheet !== null}
        title={
          sheet === "sharePeriod"
            ? "Share statement — what period?"
            : sheet === "shareMonth"
              ? "Choose a month to share"
              : sheet === "shareChannel"
                ? `Send "${sharePeriod.label}" to ${client.full_name}`
                : "Filter by month"
        }
        actions={
          sheet === "sharePeriod"
            ? sharePeriodActions
            : sheet === "shareMonth"
              ? shareMonthActions
              : sheet === "shareChannel"
                ? shareActions
                : monthActions
        }
        onClose={() => setSheet(null)}
      />

      <CustomRangeSheet
        visible={customRangeOpen}
        from={customFrom}
        to={customTo}
        onChangeFrom={setCustomFrom}
        onChangeTo={setCustomTo}
        onCancel={() => setCustomRangeOpen(false)}
        onConfirm={() => {
          if (!customFrom || !customTo) return;
          const from = toDateOnly(customFrom)!;
          const to = toDateOnly(customTo)!;
          const label = `${customFrom.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })} – ${customTo.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}`;
          setCustomRangeOpen(false);
          choosePeriod({ label, range: { from, to: to < from ? from : to } });
        }}
      />
    </View>
  );
}

/** From/to date pair for a custom statement period, shown as a bottom sheet
 * over whichever ActionSheet triggered it. */
function CustomRangeSheet({
  visible,
  from,
  to,
  onChangeFrom,
  onChangeTo,
  onCancel,
  onConfirm,
}: {
  visible: boolean;
  from: Date | null;
  to: Date | null;
  onChangeFrom: (d: Date | null) => void;
  onChangeTo: (d: Date | null) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { colors, spacing, radius, typography } = useTheme();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <Pressable style={styles.backdrop} onPress={onCancel}>
        <Pressable
          style={[styles.sheet, { backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.lg }]}
        >
          <Text style={[typography.subtitle, { color: colors.textPrimary, marginBottom: spacing.md }]}>Custom date range</Text>
          <DateField label="From" value={from} onChange={onChangeFrom} maximumDate={to ?? new Date()} />
          <DateField label="To" value={to} onChange={onChangeTo} minimumDate={from ?? undefined} maximumDate={new Date()} />
          <Button label="Share this range" onPress={onConfirm} disabled={!from || !to} pill />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function Legend({ color, label, value, note }: { color: string; label: string; value: number; note?: string }) {
  const { colors, typography } = useTheme();
  return (
    <View style={styles.legend}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <View style={{ flex: 1 }}>
        <Text style={[typography.caption, { color: colors.textSecondary }]}>
          {label}
          {note ? ` ${note}` : ""}
        </Text>
        <Text style={[typography.bodyStrong, { color: colors.textPrimary }]}>{formatINR(value)}</Text>
      </View>
    </View>
  );
}

async function openReceipt(path: string) {
  try {
    await Linking.openURL(await getReceiptUrl(path));
  } catch (err) {
    Alert.alert("Couldn't open receipt", err instanceof Error ? err.message : "Something went wrong");
  }
}

function TransactionRow({ item, showCase }: { item: ClientTransaction; showCase: boolean }) {
  const { colors, spacing, typography } = useTheme();
  const kind = kindOf(item);
  const tone = kind === "received" ? colors.success : kind === "pending" ? colors.warning : colors.danger;
  const icon = kind === "received" ? "arrow-down" : kind === "pending" ? "time-outline" : "arrow-up";
  const sign = kind === "received" ? "+" : kind === "expenses" ? "−" : "";
  const status = kind === "received" ? "Received" : kind === "pending" ? "Pending · tap to edit" : "Expense";

  // Pending fees open the edit page; everything else opens read-only details.
  const onPress = () =>
    router.push(kind === "pending" ? `/(app)/transactions/receive?id=${item.id}` : `/(app)/transactions/${item.id}`);

  const date = parseDay(item.transaction_date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        {
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.md,
          borderBottomColor: colors.border,
          backgroundColor: pressed ? colors.surfaceAlt : colors.surface,
        },
      ]}
    >
      <View style={[styles.rowIcon, { backgroundColor: `${tone}1F` }]}>
        <Ionicons name={icon} size={18} color={tone} />
      </View>
      <View style={{ flex: 1, marginHorizontal: spacing.md }}>
        <Text style={[typography.bodyStrong, { color: colors.textPrimary }]} numberOfLines={1}>
          {item.category}
          {showCase && item.cases?.title ? ` · ${item.cases.title}` : ""}
        </Text>
        <Text style={[typography.caption, { color: colors.textSecondary }]} numberOfLines={1}>
          {date}
          {item.payment_method ? ` · ${item.payment_method}` : ""}
          {item.reference_number ? ` · ${item.reference_number}` : ""}
        </Text>
      </View>
      <View style={{ alignItems: "flex-end" }}>
        <Text style={[typography.bodyStrong, { color: tone }]}>
          {sign}
          {formatINR(Number(item.amount))}
        </Text>
        <Text style={[typography.caption, { color: tone, fontSize: 11 }]}>{status}</Text>
        {item.receipt_path ? (
          <Pressable
            onPress={() => openReceipt(item.receipt_path!)}
            hitSlop={8}
            accessibilityLabel="View receipt"
            style={{ flexDirection: "row", alignItems: "center", gap: 3, marginTop: 2 }}
          >
            <Ionicons name="receipt-outline" size={13} color={colors.brand} />
            <Text style={[typography.caption, { color: colors.brand, fontSize: 11, fontWeight: "600" }]}>Receipt</Text>
          </Pressable>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(15, 23, 42, 0.4)" },
  sheet: {},
  cardActions: { flexDirection: "row", justifyContent: "flex-end" },
  cardFooter: { flexDirection: "row", alignItems: "center", borderTopWidth: StyleSheet.hairlineWidth },
  cardAction: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  heroTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  heroTitleRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  heroActions: { flexDirection: "row", alignItems: "center", gap: 18 },
  heroMeta: { flexDirection: "row", flexWrap: "wrap" },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 4, flexShrink: 1 },
  card: {
    shadowColor: "#0F172A",
    shadowOpacity: 0.08,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  donutRow: { flexDirection: "row", alignItems: "center" },
  legend: { flexDirection: "row", alignItems: "center", gap: 8 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  searchRow: { flexDirection: "row", alignItems: "center" },
  search: { flex: 1, flexDirection: "row", alignItems: "center", borderWidth: 1 },
  calendarButton: { width: 48, height: 48, alignItems: "center", justifyContent: "center", borderWidth: 1 },
  counts: { flexDirection: "row", borderWidth: 1, padding: 4 },
  countCell: { flex: 1, alignItems: "center" },
  monthHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  row: { flexDirection: "row", alignItems: "center", borderBottomWidth: StyleSheet.hairlineWidth },
  rowIcon: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
});
