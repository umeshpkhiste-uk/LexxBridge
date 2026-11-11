import { buildStatement } from "./shareStatement";
import type { Transaction } from "./api";

jest.mock("react-native", () => ({ Alert: { alert: jest.fn() }, Linking: { openURL: jest.fn() }, Platform: { OS: "ios" }, Share: { share: jest.fn() } }));

const tx = (overrides: Partial<Transaction>): Transaction => ({
  id: Math.random().toString(),
  case_id: "c1",
  client_id: "cl1",
  type: "income",
  category: "Professional fee",
  amount: 1000,
  currency: "INR",
  status: "completed",
  transaction_date: "2026-09-01",
  payment_method: null,
  reference_number: null,
  notes: null,
  receipt_path: null,
  is_refund: false,
  ...overrides,
});

describe("buildStatement", () => {
  it("totals received and pending fees and lists them oldest first", () => {
    const text = buildStatement({
      clientName: "Ravi Sharma",
      caseTitle: "Sharma v. State",
      caseNumber: "CR/12/2026",
      advocateName: "Umesh Khiste",
      transactions: [
        tx({ amount: 5000, status: "pending", transaction_date: "2026-09-20", category: "Retainer" }),
        tx({ amount: 3000, transaction_date: "2026-09-02" }),
      ],
    });
    expect(text).toContain("Case: Sharma v. State (CR/12/2026)");
    expect(text).toContain("Total fees: ₹8,000");
    expect(text).toContain("Received: ₹3,000");
    expect(text).toContain("Balance due: ₹5,000");
    expect(text.indexOf("Professional fee")).toBeLessThan(text.indexOf("Retainer"));
    expect(text).toContain("(due)");
    expect(text).toContain("Regards,\nUmesh Khiste");
  });

  it("never includes the advocate's own expenses", () => {
    const text = buildStatement({
      clientName: "Ravi",
      transactions: [tx({ type: "expense", category: "Court fee", amount: 250 })],
    });
    expect(text).not.toContain("Court fee");
    expect(text).toContain("No fee entries yet.");
  });

  it("restricts entries to a given date range and labels the period", () => {
    const text = buildStatement({
      clientName: "Ravi",
      transactions: [
        tx({ amount: 2000, transaction_date: "2026-08-15", category: "August fee" }),
        tx({ amount: 3000, transaction_date: "2026-09-10", category: "September fee" }),
      ],
      range: { from: "2026-09-01", to: "2026-09-30" },
      periodLabel: "September 2026",
    });
    expect(text).toContain("Period: September 2026");
    expect(text).toContain("September fee");
    expect(text).not.toContain("August fee");
    expect(text).toContain("Received in this period: ₹3,000");
  });

  it("shows a placeholder when a range has no entries", () => {
    const text = buildStatement({
      clientName: "Ravi",
      transactions: [tx({ transaction_date: "2026-08-15" })],
      range: { from: "2026-09-01", to: "2026-09-30" },
    });
    expect(text).toContain("No fee entries in this period.");
  });
});
