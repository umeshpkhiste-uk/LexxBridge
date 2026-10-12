/** Field validation and normalisation for Indian mobile numbers, PIN codes
 * and Bar Council enrolment numbers. */

/** Returns "+91 98765 43210" for a valid Indian mobile number, else null.
 * Accepts spaces/dashes and an optional +91, 91 or 0 prefix. */
export function normalizeIndianMobile(input: string): string | null {
  let digits = input.replace(/[\s\-().]/g, "");
  if (digits.startsWith("+91")) digits = digits.slice(3);
  else if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  if (!/^[6-9]\d{9}$/.test(digits)) return null;
  return `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`;
}

export function mobileError(input: string): string | null {
  if (!input.trim()) return null;
  return normalizeIndianMobile(input) ? null : "Enter a valid 10-digit Indian mobile number starting with 6, 7, 8 or 9";
}

export function pincodeError(input: string): string | null {
  if (!input.trim()) return null;
  return /^[1-9]\d{5}$/.test(input.trim()) ? null : "PIN code must be 6 digits and can't start with 0";
}

/**
 * Bar Council enrolment numbers follow STATE-CODE/NUMBER/YEAR, e.g.
 * MAH/1234/2015, D/5678/2010, KAR/123/2018. Returns the tidied form
 * (upper-case, "/" separators) or null if it doesn't fit.
 */
export function normalizeEnrolment(input: string, now: Date = new Date()): string | null {
  const cleaned = input.trim().toUpperCase().replace(/\s*[/\-\\ ]\s*/g, "/");
  const match = /^([A-Z]{1,5})\/?(\d{1,6})\/((?:19|20)\d{2})$/.exec(cleaned);
  if (!match) return null;
  const year = Number(match[3]);
  if (year < 1950 || year > now.getFullYear()) return null;
  return `${match[1]}/${match[2]}/${match[3]}`;
}

export function enrolmentError(input: string, now: Date = new Date()): string | null {
  if (!input.trim()) return null;
  return normalizeEnrolment(input, now) ? null : "Use the format STATE/NUMBER/YEAR, e.g. MAH/1234/2015";
}

/**
 * Indian court case numbers follow one of two formats:
 *  - CNR (Case Number Record): a permanent, system-assigned 16-character
 *    code under the eCourts system — 2-letter state code, 2-letter
 *    district/court-complex code, 2-digit establishment code, 6-digit
 *    sequence number and 4-digit year, e.g. DLST010012342024.
 *  - Traditional citation: [Case Type] SERIAL/YEAR, e.g. W.P.(C) 1234/2025,
 *    SLP (Crl) 56/2024, CC 123/2024, or bare 482/2024. The case type is
 *    optional and may contain letters, digits, dots, spaces and
 *    parentheses.
 * Returns the tidied form, or null if it fits neither.
 */
export function normalizeCaseNumber(input: string, now: Date = new Date()): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const compact = trimmed.toUpperCase().replace(/[\s-]+/g, "");
  const cnrMatch = /^[A-Z]{4}\d{12}$/.exec(compact);
  if (cnrMatch) {
    const year = Number(compact.slice(-4));
    if (year >= 1950 && year <= now.getFullYear() + 1) return compact;
  }

  const cleaned = trimmed.toUpperCase();
  const match = /^(.*?)[\s/]*(\d{1,6})\s*\/\s*((?:19|20)\d{2})$/.exec(cleaned);
  if (!match) return null;
  const year = Number(match[3]);
  if (year < 1950 || year > now.getFullYear() + 1) return null;
  const caseType = match[1].trim().replace(/\s+/g, " ");
  return [caseType, `${match[2]}/${match[3]}`].filter(Boolean).join(" ");
}

export function caseNumberError(input: string, now: Date = new Date()): string | null {
  if (!input.trim()) return null;
  return normalizeCaseNumber(input, now)
    ? null
    : "Use a CNR (16-character code) or NUMBER/YEAR, e.g. W.P.(C) 1234/2025 or DLST010012342024";
}

/**
 * A GSTIN is 15 characters: 2-digit state code, 10-character PAN, a 1-digit
 * entity number, the literal "Z", and a checksum character. This checks the
 * structure (not the checksum digit itself) and returns the upper-cased
 * form, or null if it doesn't fit.
 */
export function normalizeGstin(input: string): string | null {
  const cleaned = input.trim().toUpperCase().replace(/\s+/g, "");
  return /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(cleaned) ? cleaned : null;
}

export function gstinError(input: string): string | null {
  if (!input.trim()) return null;
  return normalizeGstin(input) ? null : "Enter a valid 15-character GSTIN, e.g. 27AAAAA0000A1Z5";
}

/**
 * A PAN (Permanent Account Number) is 10 characters: 5 letters, 4 digits,
 * 1 letter, e.g. ABCDE1234F. Returns the upper-cased form, or null if it
 * doesn't fit.
 */
export function normalizePan(input: string): string | null {
  const cleaned = input.trim().toUpperCase().replace(/\s+/g, "");
  return /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(cleaned) ? cleaned : null;
}

export function panError(input: string): string | null {
  if (!input.trim()) return null;
  return normalizePan(input) ? null : "Enter a valid 10-character PAN, e.g. ABCDE1234F";
}
