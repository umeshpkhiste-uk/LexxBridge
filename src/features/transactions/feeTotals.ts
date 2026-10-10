type FeeCase = { id: string; agreed_fee: number | string | null };
type FeeTransaction = { case_id: string | null; type: "income" | "expense"; status: "completed" | "pending"; amount: number | string };

export type FeeTotals = { totalFees: number; received: number; pending: number; expenses: number };

/**
 * Fee position for a set of cases (mirrors the case_financial_summary view):
 * a case with an agreed fee owes that fee minus what's been received; a case
 * without one owes the sum of its pending fee entries. Entries not tied to
 * one of these cases count as they are. `totalFees` folds in `expenses` too,
 * at the caller's explicit request — it is also what client-facing payment
 * statements (shareStatement.ts) show as the overall total, so an advocate's
 * own expenses do become part of what a client sees as the "Total".
 */
export function computeFeeTotals(cases: FeeCase[], transactions: FeeTransaction[]): FeeTotals {
  const byCase = new Map<string, { received: number; pendingEntries: number }>();
  const caseIds = new Set(cases.map((c) => c.id));
  let looseReceived = 0;
  let loosePending = 0;
  let expenses = 0;

  for (const t of transactions) {
    const amount = Number(t.amount);
    if (t.type === "expense") {
      expenses += amount;
      continue;
    }
    if (t.case_id && caseIds.has(t.case_id)) {
      const entry = byCase.get(t.case_id) ?? { received: 0, pendingEntries: 0 };
      if (t.status === "completed") entry.received += amount;
      else entry.pendingEntries += amount;
      byCase.set(t.case_id, entry);
    } else if (t.status === "completed") looseReceived += amount;
    else loosePending += amount;
  }

  let totalFees = looseReceived + loosePending;
  let received = looseReceived;
  let pending = loosePending;
  for (const c of cases) {
    const entry = byCase.get(c.id) ?? { received: 0, pendingEntries: 0 };
    const fee = c.agreed_fee === null || c.agreed_fee === undefined ? null : Number(c.agreed_fee);
    received += entry.received;
    if (fee !== null) {
      totalFees += fee;
      pending += Math.max(fee - entry.received, 0);
    } else {
      totalFees += entry.received + entry.pendingEntries;
      pending += entry.pendingEntries;
    }
  }
  return { totalFees: totalFees + expenses, received, pending, expenses };
}
