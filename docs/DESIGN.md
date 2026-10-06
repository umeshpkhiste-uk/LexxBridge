# Design System

The actual design tokens and UI primitives LexxBridge is built from — all defined in code, not in
a separate design tool, so this file describes what `src/shared/ui/` already enforces rather than
prescribing something new. If this file and the code disagree, the code wins; update this file.

For the visual references the shipped screens are loosely styled after (not pixel specs), see
"Design references" in [`../README.md`](../README.md) and the `design/` folder.

## Tokens (`src/shared/ui/theme.ts`)

Every screen reads tokens through `useTheme()`, never a hardcoded color/size — that's what makes
light/dark mode and any future palette change a one-file edit instead of a grep-and-replace.

### Color

One `palette` of raw hex values feeds two semantic maps, `lightColors` and `darkColors`. Screens
only ever reference the semantic name (`colors.brand`, `colors.danger`), never the palette
directly.

| Semantic | Light | Dark | Use |
|---|---|---|---|
| `background` | `#F8FAFC` | `#0F172A` | Screen background |
| `surface` | `#FFFFFF` | `#1E293B` | Cards, sheets, the app bar |
| `surfaceAlt` | `#F1F5F9` | `#233047` | Secondary surface (e.g. input backgrounds) |
| `border` | `#E2E8F0` | `#2D3B52` | Dividers, input/card borders |
| `textPrimary` | `#0F172A` | `#F8FAFC` | Default text |
| `textSecondary` | `#64748B` | `#94A3B8` | De-emphasized text (captions, metadata) |
| `textInverse` | `#FFFFFF` | `#FFFFFF` | Text on a filled brand/accent background |
| `brand` | `#1E3A5F` | `#3B6EA5` | Primary action color |
| `brandPressed` | `#16283F` | `#5588C2` | Pressed/active state of `brand` |
| `accent` | `#B08D57` (gold) | `#B08D57` | Secondary emphasis — used sparingly, never as a second CTA color |
| `success` | `#1B7A43` | `#3CB371` | Positive status (paid, confirmed) |
| `danger` | `#B3261E` | `#E5675F` | Destructive actions, errors |
| `warning` | `#A16207` | `#D9A441` | Caution states (pending, overdue) |

Deliberately **no illustrations, no bright gradients** — a professional/minimal visual language,
distinct from the generic UI-kit references in `design/` that only inform layout structure.

### Spacing (`spacing`)

4/8/16/24/32/48 as `xs`/`sm`/`md`/`lg`/`xl`/`xxl`. `lg` (24) is the standard screen padding
(`ScreenContainer`'s default).

### Radius (`radius`)

`sm` 8, `md` 12, `lg` 16, `pill` 999 (fully rounded — used for chips, badges, and `Button`'s
optional `pill` variant on auth-screen CTAs only).

### Typography (`typography`)

| Style | Size / weight / line height | Use |
|---|---|---|
| `display` | 28 / 700 / 34 | Rare — splash/empty-state hero text |
| `title` | 22 / 700 / 28 | Screen titles |
| `subtitle` | 17 / 600 / 22 | Section headers, card titles |
| `body` | 15 / 400 / 22 | Default body text |
| `bodyStrong` | 15 / 600 / 22 | Emphasized body text (names, amounts) |
| `caption` | 13 / 400 / 18 | Metadata, timestamps, helper text |
| `label` | 13 / 600 / 16 | Form field labels, small UI labels |

No custom font family — system default on every platform.

## Light / dark / system

`useColorScheme()` drives `useTheme()` automatically. The advocate's explicit choice (Settings →
Appearance: System default / Light / Dark) is persisted via `themePreference.ts`
(`AsyncStorage` key `theme.preference`) and applied with `Appearance.setColorScheme()` at startup
and on change — so the override is global, not re-derived per screen.

## UI primitives (`src/shared/ui/`)

Reuse these; don't build a one-off styled component for something this list already covers.

| Component | Purpose |
|---|---|
| `Button` | Primary/secondary/ghost variants, loading state, optional `pill` shape (auth CTAs only) |
| `TextField`, `SelectField`, `DateField`, `TagInput` | Form inputs, theme-driven border/background |
| `ScreenContainer` | Safe-area + keyboard-avoiding screen wrapper; `scroll` prop toggles a `ScrollView`; skips the top inset automatically when a nav header is already shown |
| `ListRow` | Standard row layout (icon/text/accessory) used across settings, lists, directories |
| `SettingsGroup` | Grouped-rows card, used for every Settings-style screen |
| `Badge`, `Chip` | Status/tag pills (verification status, block reason, etc.) |
| `ActionSheet` | Bottom action sheet (native) / fallback presentation on web |
| `SegmentedControl` | Tab-style in-screen switch (e.g. Cases/Network sub-tabs) |
| `DonutChart` | Ledger/financial summary visualization |
| `Fab`, `CenterFabTabBar` | Floating action button and the center-FAB bottom tab bar |
| `HeaderBackButton`, `HomeButton` | Navigation header accessories |
| `AppLogo` | The LexxBridge mark, used on auth screens and splash |
| `ComingSoon` | Placeholder screen for not-yet-built features — never silently blank-screen a route |
| `WebAlertHost` | Web-only `Alert`/`confirmAlert` replacement, since native `Alert` doesn't exist on web |
| `appFrame.tsx` | Shared outer frame (width constraint, background) applied on web so the app doesn't stretch edge-to-edge on wide viewports |

## Platform differences worth knowing

- **Web** gets a max-width frame (`appFrame.tsx`) instead of stretching full browser width; native
  does not.
- **Face ID/fingerprint, PIN/pattern app lock, push notifications, and calendar reminders** are
  phone-only — not available on web, and screens using them must degrade gracefully (see
  `docs/AUTH.md`), not crash or dead-end.
- Native `Alert.alert()` has no web equivalent — always go through `WebAlertHost`'s
  `confirmAlert()` helper, not `Alert` directly, if the call site can run on web.
