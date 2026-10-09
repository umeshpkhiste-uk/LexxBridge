/** Structured copy for the public /legal/* pages. Keep this in sync with the
 * canonical markdown in the repo's legal/ folder — this is the version that
 * actually ships in the app and on the web, which is what Google Play's
 * reviewer and users will read.
 *
 * Replace every [bracketed placeholder] with real details before release. */

export const LEGAL_UPDATED = "30 September 2026";
export const SUPPORT_EMAIL = "[support@yourdomain.com]";
export const COMPANY_NAME = "[Your company / developer name]";

export type LegalSection = { heading: string; paragraphs: string[] };

export const PRIVACY_SECTIONS: LegalSection[] = [
  {
    heading: "1. Who we are",
    paragraphs: [
      `LexxBridge is developed and operated by ${COMPANY_NAME}. Contact us at ${SUPPORT_EMAIL} for any privacy question or request.`,
    ],
  },
  {
    heading: "2. Information we collect",
    paragraphs: [
      "Information you provide directly:",
      "• Account details — name, email, phone number, password (stored hashed, never in plain text).",
      "• Professional profile — headline, bio, practice areas, courts, city, photo, and optionally date of birth and address.",
      "• Client & case data — client names, contacts, case numbers, hearings, tasks, meeting notes and fee/payment records you enter to manage your practice. Private to your account by default.",
      "• Messages — chats with other advocates. Messages are end-to-end encrypted; the key never leaves your device, and we cannot read message content.",
      "• Files & photos — documents, receipts and images you attach to cases, chats, posts or your profile.",
      "• Support requests — anything you send us directly.",
      "Information collected automatically:",
      "• Usage & diagnostic data — basic device info and error logs, used to keep the app reliable.",
      "• Biometric authentication — if you enable Face ID / fingerprint login, your device's OS handles the match locally. We never receive, store or transmit biometric data.",
      "We do not collect location data and do not use advertising SDKs or advertising identifiers.",
    ],
  },
  {
    heading: "3. How we use information",
    paragraphs: [
      "We use this information to provide and secure the Service (storing your clients, cases, hearings, tasks and payments; delivering messages; sending notifications), let advocates you connect with see the profile fields you've chosen to share, send account emails and optional notifications, diagnose and fix bugs, and comply with legal obligations.",
      "We do not sell your personal information, and we never use your client or case data to train any third-party AI model.",
    ],
  },
  {
    heading: "4. Who we share information with",
    paragraphs: [
      "• Supabase, our backend provider, hosts our database, authentication and file storage under its own data-processing terms.",
      "• Other advocates you connect with see only the profile fields you make visible, and messages you choose to send them.",
      "• Service providers that keep the app running (e.g. Vercel web hosting, push-notification delivery).",
      "We don't share your client, case or financial data with anyone else, and never sell personal information. We may disclose information if required by law.",
    ],
  },
  {
    heading: "5. Data security",
    paragraphs: [
      "Passwords are hashed. Chat messages are end-to-end encrypted. Data in transit is encrypted (HTTPS/TLS) and data at rest is encrypted by our backend provider. Row-level access controls keep your clients, cases, hearings, tasks and payments visible only to your account. No system is 100% secure and we cannot guarantee absolute security.",
    ],
  },
  {
    heading: "6. Your choices and rights",
    paragraphs: [
      "From Profile → Settings in the app you can, at any time, export a full copy of your data, delete your account permanently (profile, clients, cases, hearings, documents, payments, posts, chats, connections, notifications and every uploaded file), change your profile visibility, or turn off notifications.",
      "If you can't access the app, see our account-deletion page for how to request deletion by email instead.",
      `Depending on where you live, you may have rights under laws like GDPR or the CCPA to access, correct, port or restrict your data — contact ${SUPPORT_EMAIL} to exercise them.`,
    ],
  },
  {
    heading: "7. Data retention",
    paragraphs: [
      "We keep your data while your account is active. Deleting your account permanently removes your data from production systems, subject to residual copies in encrypted backups, purged on our normal rotation schedule.",
    ],
  },
  {
    heading: "8. Children's privacy",
    paragraphs: [
      "LexxBridge is intended for licensed advocates, lawyers and legal professionals, and is not directed at children. We do not knowingly collect information from anyone under 18.",
    ],
  },
  {
    heading: "9. International transfers",
    paragraphs: [
      "Your information may be processed in a country other than the one you live in. We take steps to protect it wherever it is processed.",
    ],
  },
  {
    heading: "10. Changes to this policy",
    paragraphs: [
      "We may update this Privacy Policy from time to time. We'll update the date above and notify you in-app for material changes.",
    ],
  },
  {
    heading: "11. Contact us",
    paragraphs: [`${COMPANY_NAME}\nEmail: ${SUPPORT_EMAIL}`],
  },
];

export const TERMS_SECTIONS: LegalSection[] = [
  {
    heading: "1. Who can use LexxBridge",
    paragraphs: [
      "LexxBridge is intended for licensed advocates, lawyers and legal professionals to manage clients, cases, hearings, tasks, payments and professional networking. You must be at least 18 and able to form a binding contract to use the Service, and you're responsible for the accuracy of the professional information you provide.",
    ],
  },
  {
    heading: "2. Your account",
    paragraphs: [
      "You're responsible for keeping your login credentials and any device unlock (biometric, PIN or pattern) confidential, and for all activity under your account. Notify us immediately if you suspect unauthorized use.",
    ],
  },
  {
    heading: "3. Your content and data",
    paragraphs: [
      "You retain ownership of the client, case, hearing, task, payment and document data you enter (\"Your Content\"). You're solely responsible for its accuracy, legality, and any confidentiality obligations you owe your clients under applicable professional-conduct rules.",
      "You grant us a limited license to host, store, back up and process Your Content solely to provide and improve the Service, and confirm you have the rights and consents needed to enter any client or third-party information.",
      "Chat messages are end-to-end encrypted; we cannot read them and cannot recover them if you lose access to the device holding your encryption key.",
    ],
  },
  {
    heading: "4. Acceptable use",
    paragraphs: [
      "You agree not to use the Service unlawfully or in violation of any professional-conduct rule; upload content you don't have the right to share or that is defamatory or infringing; attempt unauthorized access to another user's account or our systems; reverse-engineer or interfere with the Service; or harass, spam or impersonate others via networking/posting features. Reported content may be reviewed and removed at our discretion.",
    ],
  },
  {
    heading: "5. Professional networking features",
    paragraphs: [
      "Posts, connections and public profile visibility are optional and controlled by you (Public, Connections only, or Private) from Profile → Settings. We're not responsible for other users' content or conduct.",
    ],
  },
  {
    heading: "6. Payments and fee records",
    paragraphs: [
      "Payment/fee-ledger features are record-keeping tools for amounts you and your clients agree upon and receive. LexxBridge does not process, hold or transmit any actual money, and is not a payment processor, escrow agent, or party to any fee arrangement between you and your clients.",
    ],
  },
  {
    heading: "7. Availability and changes",
    paragraphs: [
      "We aim to keep the Service available and reliable but don't guarantee uninterrupted access. We may modify, suspend or discontinue any part of it, and may update these Terms from time to time; continued use after an update means you accept the revised Terms.",
    ],
  },
  {
    heading: "8. Termination",
    paragraphs: [
      "You may stop using the Service and delete your account at any time from Profile → Settings → Delete account, which permanently erases your data as described in our Privacy Policy. We may suspend or terminate accounts that violate these Terms.",
    ],
  },
  {
    heading: "9. Disclaimers",
    paragraphs: [
      "The Service is provided \"as is\" without warranties of any kind. LexxBridge is a practice-management tool, not a source of legal advice, and doesn't review, verify or take responsibility for the legal accuracy of anything you record in it.",
    ],
  },
  {
    heading: "10. Limitation of liability",
    paragraphs: [
      "To the maximum extent permitted by law, LexxBridge and its developers are not liable for indirect, incidental, special or consequential damages, or for loss of data, profits or business, arising from your use of the Service.",
    ],
  },
  {
    heading: "11. Governing law",
    paragraphs: ["These Terms are governed by the laws of [your jurisdiction], without regard to conflict-of-law principles."],
  },
  {
    heading: "12. Contact us",
    paragraphs: [`${COMPANY_NAME}\nEmail: ${SUPPORT_EMAIL}`],
  },
];

export const DELETE_ACCOUNT_SECTIONS: LegalSection[] = [
  {
    heading: "Option 1 — delete it yourself, in the app (immediate)",
    paragraphs: [
      "1. Open LexxBridge and sign in.",
      "2. Go to Profile → Settings → Delete account (bottom of the Account section).",
      "3. Confirm twice. This is permanent and cannot be undone.",
      "This immediately and permanently deletes your profile and login credentials; every client and case you created; hearings, tasks, meetings and notes; payment/fee-ledger records; documents and photos you uploaded; posts, comments and reactions; and chat messages, connections and notifications.",
    ],
  },
  {
    heading: "Option 2 — request deletion by email (no app access needed)",
    paragraphs: [
      `If you no longer have access to the app or your device, email ${SUPPORT_EMAIL} from the email address on your account and ask us to delete your account. Include your registered email and phone number so we can verify it's you. We'll delete your account and associated data within 30 days and confirm by email once it's done.`,
    ],
  },
  {
    heading: "What is NOT deleted",
    paragraphs: [
      "Copies retained in encrypted backups are purged on our normal backup rotation schedule. Records we're legally required to keep (e.g. for tax, audit or legal compliance) are retained only as long as the law requires, then deleted.",
    ],
  },
  {
    heading: "Partial deletion",
    paragraphs: [
      `If you'd like specific data deleted (e.g. a single client or case) without deleting your whole account, remove it directly in the app, or email us at ${SUPPORT_EMAIL} with what you'd like removed.`,
    ],
  },
];
