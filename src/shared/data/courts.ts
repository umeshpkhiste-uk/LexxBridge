/** Common Indian court/forum names, ordered by the judicial hierarchy
 * (Supreme Court → High Court → District/Sessions → Civil/Magistrate
 * courts), followed by special courts and tribunals. Used both as
 * suggestions for the advocate's own "practises before" list (profile) and
 * as the picker options for a case's court (CaseOverview), so the two stay
 * in sync. */
export const COURT_OPTIONS = [
  // Hierarchy of courts.
  "Supreme Court of India",
  "High Court",
  "District Court",
  "Sessions Court",
  "Civil Judge (Senior Division)",
  "Civil Judge (Junior Division)",
  "Judicial Magistrate Court",
  // Special courts and tribunals.
  "Family Court",
  "Commercial Court",
  "Consumer Commission",
  "Motor Accident Claims Tribunal (MACT)",
  "National Green Tribunal (NGT)",
  "Lok Adalat",
  "NCLT",
  "NCLAT",
  "ITAT",
  "Labour Court",
];
