import { clientCaseTargets, isOldClient } from "./clientCases";

const c = (id: string, created_at: string, is_archived = false, discontinued_at: string | null = null) => ({
  id,
  title: id,
  court: null,
  created_at,
  is_archived,
  discontinued_at,
  discontinuation_reason: null,
});

describe("clientCaseTargets", () => {
  it("lists open cases newest first and skips archived ones", () => {
    expect(clientCaseTargets([c("old", "2026-01-01"), c("arch", "2026-09-01", true), c("new", "2026-05-01")]).map((x) => x.id)).toEqual([
      "new",
      "old",
    ]);
  });

  it("falls back to archived cases when there are no open ones", () => {
    expect(clientCaseTargets([c("a", "2026-01-01", true), c("b", "2026-02-01", true)]).map((x) => x.id)).toEqual(["b", "a"]);
  });

  it("returns nothing for a client without cases", () => {
    expect(clientCaseTargets([])).toEqual([]);
  });
});

describe("isOldClient", () => {
  it("is false for a client with no cases yet", () => {
    expect(isOldClient([])).toBe(false);
  });

  it("is false while any active case remains, even alongside a discontinued one", () => {
    expect(isOldClient([c("active", "2026-01-01"), c("gone", "2025-01-01", true, "2025-06-01")])).toBe(false);
  });

  it("is false for a case simply archived without being discontinued", () => {
    expect(isOldClient([c("archived", "2025-01-01", true)])).toBe(false);
  });

  it("is true once the only case is discontinued", () => {
    expect(isOldClient([c("gone", "2025-01-01", true, "2025-06-01")])).toBe(true);
  });
});
