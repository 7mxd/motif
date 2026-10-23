# Simulator check: HiSalon's Flutter app on Motif's generated theme

- **Date:** 2026-10-23
- **Gate:** the last v0.5.0 release gate (spec §11 of [Part 2](../specs/2026-10-19-motif-part2-all-stacks-design.md), plan 2E Task 15 item 6): run the generated theme on an iPhone. The owner chose the iOS simulator on the Mac mini instead.
- **Motif:** main `a370253`, then branch `fix/v050-gate` (`6c5699f`), run from source on the Mac mini (`bun cli/src/main.ts …`).
- **HiSalon:** a `--no-hardlinks` clone of the Mac's copy of the repository at `19407123`, in a scratch folder. The real repository wasn't touched.
- **Device:** a simulator Motif's check created for the run (iPhone 18 Pro, iOS 27.0), Flutter 3.47.5, a debug build attached with `flutter run`.

## What was done in the scratch copy

- `motif extract --app mobile/customer` drafted the guide: three variants (default, male, female) from `HiSalonColors`, Onest with Thmanyah Sans as the Arabic companion. One value was changed so it validates, as in the [first hands-on test](2026-10-20-hisalon-hands-on.md): `focus` to HiSalon's own `accentStrong`, #0E5C4D. A ten-section `DESIGN.md` was added. `motif validate`: 102 theme values and 78 readability checks passed.
- `motif tokens` wrote `lib/design/motif_theme.dart`; `flutter analyze` found no issues.
- `main.dart`'s `MaterialApp` took `MotifTheme.light(variant: …)` and `MotifTheme.dark(variant: …)` in place of HiSalon's own theme, keeping HiSalon's palette extension for the widgets that read it. The variant followed HiSalon's own palette choice, or a `--dart-define=MOTIF_VARIANT` to force one.
- The app talked to HiSalon's public API as a guest (`--dart-define=API_BASE_URL=https://api.hisalon.ai`), so the screens showed real salons. No one signed in: the App Review login lives only in the production secret store.

## What it showed

Landing, guest home, a salon's page, the profile and the sign-in screen, in the three variants, light and dark, English and Arabic. Onest and Thmanyah Sans drew correctly, Arabic mirrored the layouts, and each variant's action colour reached the filled buttons (mint, slate, purple).

## Problems found in Motif, and fixed

1. **Text buttons in a light action colour couldn't be read.** HiSalon's action colour is a mint fill (#7EEBC1) on a near-white page. Flutter draws text and outlined button labels in `ColorScheme.primary`, so the update card's "Later" was mint on white, about 1.4:1. Compose (`primary`) and SwiftUI (`.tint`) had the same problem. Fixed: theme code adds `actionText`, the same hue made darker until it reads (#008260 here, 4.55:1). Flutter's text, outlined and elevated buttons use it, Compose's `primary` is it with the mint kept as the fill, and SwiftUI tints with it. "Later" now reads; "Update" keeps the mint.
2. **Outlines were nearly black.** `border` came from HiSalon's 8% hairline (`#0f3c3214`) and was drafted as its solid colour, #0F3C32. Fixed: a see-through border, text or surface colour is drafted as it shows over the background (#E6EBE9 here), in dark mode and in each variant too.

## Not Motif's

- A debug build relaunched without `flutter run` attached stayed on HiSalon's splash; attached, it booted every time.
- Something on the Mac (likely its disk guard) cleared the shared Dart package cache twice during the run; the builds used a package cache of their own.
