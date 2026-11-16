import { DELETE_ACCOUNT_SECTIONS, PRIVACY_SECTIONS, SUPPORT_EMAIL, TERMS_SECTIONS, type LegalSection } from "../legalContent";
import { DELETE_ACCOUNT_SECTIONS_HI, PRIVACY_SECTIONS_HI, TERMS_SECTIONS_HI } from "./hi";
import { DELETE_ACCOUNT_SECTIONS_MR, PRIVACY_SECTIONS_MR, TERMS_SECTIONS_MR } from "./mr";

// The translations must mirror the English section-for-section, so editing
// the English without updating them fails here instead of silently leaving
// Hindi/Marathi readers with an outdated notice (DPDP Act §5(3)).
const PAIRS: [string, LegalSection[], LegalSection[]][] = [
  ["privacy/hi", PRIVACY_SECTIONS, PRIVACY_SECTIONS_HI],
  ["privacy/mr", PRIVACY_SECTIONS, PRIVACY_SECTIONS_MR],
  ["terms/hi", TERMS_SECTIONS, TERMS_SECTIONS_HI],
  ["terms/mr", TERMS_SECTIONS, TERMS_SECTIONS_MR],
  ["delete/hi", DELETE_ACCOUNT_SECTIONS, DELETE_ACCOUNT_SECTIONS_HI],
  ["delete/mr", DELETE_ACCOUNT_SECTIONS, DELETE_ACCOUNT_SECTIONS_MR],
];

describe.each(PAIRS)("%s translation", (_name, english, translated) => {
  it("has the same sections and paragraph counts as the English", () => {
    expect(translated.map((s) => s.paragraphs.length)).toEqual(english.map((s) => s.paragraphs.length));
  });

  it("keeps the contact email wherever the English has it", () => {
    english.forEach((section, i) => {
      section.paragraphs.forEach((p, j) => {
        if (p.includes(SUPPORT_EMAIL)) expect(translated[i].paragraphs[j]).toContain(SUPPORT_EMAIL);
      });
    });
  });

  it("keeps the same section numbering", () => {
    const num = (h: string) => h.match(/^\d+\./)?.[0] ?? null;
    expect(translated.map((s) => num(s.heading))).toEqual(english.map((s) => num(s.heading)));
  });
});
