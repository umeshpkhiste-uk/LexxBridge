import type { ClientCaseBrief } from "./api";

/** A client's cases in the order to offer them: open cases newest first, or
 * (only when every case is archived) the archived ones newest first. */
export function clientCaseTargets(cases: ClientCaseBrief[]): ClientCaseBrief[] {
  const sorted = [...cases].sort((a, b) => b.created_at.localeCompare(a.created_at));
  const open = sorted.filter((c) => !c.is_archived);
  return open.length ? open : sorted;
}

/** A client only counts as "old" once a discontinue action has actually
 * happened for them — not just for having no cases yet (a brand-new client
 * stays "present"). Derived from the cases already on hand, so a client who
 * later gets a new active case automatically moves back to "present" with
 * no extra bookkeeping. */
export function isOldClient(cases: ClientCaseBrief[]): boolean {
  const hasActive = cases.some((c) => !c.is_archived);
  const hasDiscontinued = cases.some((c) => c.discontinued_at);
  return !hasActive && hasDiscontinued;
}
