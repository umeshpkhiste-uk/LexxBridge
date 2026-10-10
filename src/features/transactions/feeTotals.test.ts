import { computeFeeTotals } from "./feeTotals";

const inc = (case_id: string | null, amount: number, status: "completed" | "pending" = "completed") => ({
  case_id,
  type: "income" as const,
  status,
  amount,
});

describe("computeFeeTotals", () => {
  it("uses the agreed fee: pending is fee minus received", () => {
    const totals = computeFeeTotals([{ id: "c1", agreed_fee: 50000 }], [inc("c1", 10000), inc("c1", 5000)]);
    expect(totals).toEqual({ totalFees: 50000, received: 15000, pending: 35000, expenses: 0 });
  });

  it("never shows a negative balance when more than the fee was received", () => {
    const totals = computeFeeTotals([{ id: "c1", agreed_fee: "1000.00" }], [inc("c1", 1500)]);
    expect(totals.pending).toBe(0);
    expect(totals.received).toBe(1500);
  });

  it("falls back to pending entries for cases without an agreed fee", () => {
    const totals = computeFeeTotals([{ id: "c1", agreed_fee: null }], [inc("c1", 11000), inc("c1", 4000, "pending")]);
    expect(totals).toEqual({ totalFees: 15000, received: 11000, pending: 4000, expenses: 0 });
  });

  it("adds up several cases plus entries not tied to a case, and tracks expenses", () => {
    const totals = computeFeeTotals(
      [
        { id: "a", agreed_fee: 20000 },
        { id: "b", agreed_fee: null },
      ],
      [inc("a", 5000), inc("b", 2000, "pending"), inc(null, 1000), { case_id: "a", type: "expense", status: "completed", amount: 300 }],
    );
    // totalFees and pending both fold expenses in (23000 fees + 300
    // expenses; 17000 fee-pending + 300 expenses) — see the doc comment on
    // computeFeeTotals for why, and that totalFees === received + pending.
    expect(totals).toEqual({ totalFees: 23300, received: 6000, pending: 17300, expenses: 300 });
  });
});
