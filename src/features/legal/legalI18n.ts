import i18next from "i18next";
import { DELETE_ACCOUNT_SECTIONS, LEGAL_UPDATED, LegalSection, PRIVACY_SECTIONS, REFUND_SECTIONS, TERMS_SECTIONS } from "./legalContent";
import { DELETE_ACCOUNT_SECTIONS_HI, PRIVACY_SECTIONS_HI, REFUND_SECTIONS_HI, TERMS_SECTIONS_HI } from "./translations/hi";
import { DELETE_ACCOUNT_SECTIONS_MR, PRIVACY_SECTIONS_MR, REFUND_SECTIONS_MR, TERMS_SECTIONS_MR } from "./translations/mr";

/** DPDP Act §5(3) and §6(3): the notice and the consent request must be
 * available in English or any Eighth Schedule language. The legal pages and
 * the consent screen offer English, Hindi and Marathi. To add a language,
 * add a translations/<code>.ts file and an entry in each map below. */
export type LegalLanguage = "en" | "hi" | "mr";
export type LegalDoc = "privacy" | "terms" | "refund" | "deleteAccount";

export const LEGAL_LANGUAGES: { code: LegalLanguage; label: string }[] = [
  { code: "en", label: "English" },
  { code: "hi", label: "हिन्दी" },
  { code: "mr", label: "मराठी" },
];

const DOCS: Record<LegalLanguage, Record<LegalDoc, LegalSection[]>> = {
  en: { privacy: PRIVACY_SECTIONS, terms: TERMS_SECTIONS, refund: REFUND_SECTIONS, deleteAccount: DELETE_ACCOUNT_SECTIONS },
  hi: { privacy: PRIVACY_SECTIONS_HI, terms: TERMS_SECTIONS_HI, refund: REFUND_SECTIONS_HI, deleteAccount: DELETE_ACCOUNT_SECTIONS_HI },
  mr: { privacy: PRIVACY_SECTIONS_MR, terms: TERMS_SECTIONS_MR, refund: REFUND_SECTIONS_MR, deleteAccount: DELETE_ACCOUNT_SECTIONS_MR },
};

export const LEGAL_UI: Record<
  LegalLanguage,
  { titles: Record<LegalDoc, string>; lastUpdated: string; updatedDate: string; prevails: string | null }
> = {
  en: {
    titles: { privacy: "Privacy Policy", terms: "Terms of Service", refund: "Refund & Cancellation Policy", deleteAccount: "Delete your account & data" },
    lastUpdated: "Last updated",
    // The Hindi/Marathi dates below must be changed by hand alongside this.
    updatedDate: LEGAL_UPDATED,
    prevails: null,
  },
  hi: {
    titles: { privacy: "गोपनीयता नीति", terms: "सेवा की शर्तें", refund: "रिफ़ंड और रद्दीकरण नीति", deleteAccount: "अपना खाता और डेटा हटाएँ" },
    lastUpdated: "अंतिम अद्यतन",
    updatedDate: "24 नवंबर 2026",
    prevails: "यह अंग्रेज़ी संस्करण का अनुवाद है। किसी भी विरोधाभास की स्थिति में अंग्रेज़ी संस्करण मान्य होगा।",
  },
  mr: {
    titles: { privacy: "गोपनीयता धोरण", terms: "सेवेच्या अटी", refund: "परतावा आणि रद्दीकरण धोरण", deleteAccount: "तुमचे खाते आणि डेटा हटवा" },
    lastUpdated: "अंतिम अद्यतन",
    updatedDate: "24 नोव्हेंबर 2026",
    prevails: "हे इंग्रजी आवृत्तीचे भाषांतर आहे. कोणत्याही विसंगतीच्या स्थितीत इंग्रजी आवृत्ती ग्राह्य धरली जाईल.",
  },
};

export function legalSections(doc: LegalDoc, language: LegalLanguage): LegalSection[] {
  return DOCS[language][doc];
}

/** The app's chosen language when it's one the legal pages are translated
 * into, otherwise English. */
export function defaultLegalLanguage(): LegalLanguage {
  const lang = i18next.language;
  return lang === "hi" || lang === "mr" ? lang : "en";
}
