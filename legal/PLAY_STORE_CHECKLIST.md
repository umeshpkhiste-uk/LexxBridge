# Play Store readiness checklist

Tracks what's done in-repo vs. what still needs to happen in Google Play
Console / Google Cloud (things no amount of code can finish for you).

## Done in this repo

- [x] Privacy Policy — [`legal/PRIVACY_POLICY.md`](./PRIVACY_POLICY.md),
      also live in-app and on the web at `/legal/privacy`.
- [x] Terms of Service — [`legal/TERMS_OF_SERVICE.md`](./TERMS_OF_SERVICE.md),
      also live at `/legal/terms`.
- [x] Account & data deletion policy —
      [`legal/ACCOUNT_DELETION.md`](./ACCOUNT_DELETION.md), also live at
      `/legal/delete-account`. In-app deletion already exists at
      Profile → Settings → Delete account.
- [x] Data safety mapping — [`legal/DATA_SAFETY.md`](./DATA_SAFETY.md), for
      pasting into Play Console's Data safety form.
- [x] Android permission strings justified in `app.json`
      (`NSPhotoLibraryUsageDescription`, `NSCameraUsageDescription`,
      `faceIDPermission`, `ITSAppUsesNonExemptEncryption`).
- [x] Adaptive icon, notification icon, splash screen configured.
- [x] `eas.json` production build profile configured.

## Still needed before submitting (must be done by you, outside this repo)

### 1. Fill in real contact details — done
Developer name (**LexxBridge**), support email
(**deepomeshcreation@gmail.com** — matches the Google Play Console
account), and governing-law jurisdiction (**India**) are filled in across
`legal/*.md` and `src/features/legal/legalContent.ts`. No postal address
is listed — not required for the Play Store submission, and omitted
rather than publishing a placeholder or fabricated one.

### 2. Deploy the legal pages so the URLs are live
The Vercel web build already serves these at:
- `https://lexxbridge.app/legal/privacy`
- `https://lexxbridge.app/legal/terms`
- `https://lexxbridge.app/legal/delete-account`

Use that exact URL in Play Console. Google reviews the Privacy Policy URL,
so double-check it loads without login before submitting.

### 3. Google Play Console setup
- Create a developer account (one-time $25 fee) if you don't have one.
- Create the app listing: title, short/full description, category (likely
  "Business" or "Productivity"), contact email, and the Privacy Policy URL
  above.
- **Data safety form**: fill it in using [`DATA_SAFETY.md`](./DATA_SAFETY.md).
- **App content** declarations: Ads (none), Content rating questionnaire,
  Target audience (18+ / professionals, not directed at children),
  Government apps (no), News apps (no), COVID-19 contact tracing (no).
- **Account deletion**: Play Console's "Data safety" section will ask for
  an account-deletion URL — use `/legal/delete-account` above.
- Store listing assets: app icon (512×512 already in `assets/images`),
  feature graphic (1024×500 — not in this repo, needs designing), at least
  2 phone screenshots (and tablet screenshots if `supportsTablet` stays
  true on iOS/Android).

### 4. Signing & release build
- Run `eas build --platform android --profile production` (production
  profile is already configured in `eas.json`).
- EAS manages your Android signing keystore by default — confirm you have
  access to/backup of the keystore credentials before your first submit.
- Check `android.versionCode` in `app.json` bumps on every release
  (`autoIncrement: true` in the production EAS profile already handles
  this for builds triggered via EAS).

### 5. Target API level
Google Play requires new apps/updates to target a recent Android API level
(check the current requirement at the time you submit — it changes yearly).
Expo SDK 57's default Android target should already satisfy the current
requirement; verify at build time if Play Console flags it.

### 6. Submit
- `eas submit --platform android` (requires a Google Play service-account
  JSON key the first time — see Expo's docs for `eas submit` Android setup).
- Expect Google's review to take anywhere from a few hours to a few days,
  and expect at least one round of feedback if this is a new developer
  account (new accounts often get extra scrutiny on their first app).

## iOS (App Store) — if you plan to submit there too

The same `legal/` pages cover Apple's Privacy Policy requirement. You'll
additionally need:
- An Apple Developer account ($99/yr).
- App Store Connect listing, screenshots, and the App Privacy
  ("nutrition label") questionnaire — use `DATA_SAFETY.md` as the source
  there too, the categories map closely.
- `ITSAppUsesNonExemptEncryption` is already set to `false` in `app.json`,
  which (if accurate — i.e. you only use standard HTTPS/TLS and the
  messaging encryption is for your own app's use, not exportable crypto
  meant for others) avoids Apple's export-compliance questionnaire at
  submission. Re-check this is still accurate before submitting.
