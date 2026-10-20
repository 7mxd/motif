# Theme code

What `motif tokens` writes for a Flutter app, how to wire it in, how widgets read it, how to load the theme's fonts and how to switch between design variants.

## What `motif tokens` writes

One Dart file: `lib/design/motif_theme.dart` (or the folder `themeDir` names in `design/motif.json`; see the [README](README.md)). Never edit it; change `design/tokens.json` and run `motif tokens` again. `motif check` reports a hand edit as `generated-edited`. It holds:

| Class | What it is | Use it as |
|---|---|---|
| `MotifColors` | A `ThemeExtension` with every colour role, light and dark | `MotifColors.of(context).textSecondary` |
| `MotifSpace` | The spacing scale in logical pixels | `MotifSpace.s4` (16) |
| `MotifRadius` | Corner sizes | `MotifRadius.md` |
| `MotifShadows` | Shadows as lists of `BoxShadow` | `boxShadow: MotifShadows.md` |
| `MotifText` | The type roles: size, weight, line height and letter spacing, with the theme's fonts | `MotifText.body` |
| `MotifDurations`, `MotifCurves`, `MotifSprings` | The motion roles ([motion](motion.md)) | `MotifDurations.base` |
| `MotifMotion` | Reduced motion helpers | `MotifMotion.duration(context, MotifDurations.base)` |
| `MotifTheme` | Material `ThemeData` for light and dark | `MotifTheme.light()` |

Names are the guide's roles in camelCase (`text-secondary` is `textSecondary`), and the file lists exactly the roles the guide has. Read the file when unsure which exist; don't guess one.

## Wiring it in

Set the themes once, on the app's `MaterialApp`, and remove the starter's own theme (`ThemeData(colorScheme: ColorScheme.fromSeed(…))` and the `useMaterial3` line from `flutter create`) so it can't override the design guide:

```dart
import 'package:flutter/material.dart';

import 'design/motif_theme.dart';
import 'features/home/home_screen.dart';

class App extends StatelessWidget {
  const App({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'My app',
      theme: MotifTheme.light(),
      darkTheme: MotifTheme.dark(),
      home: const HomeScreen(),
    );
  }
}
```

`themeMode` stays `ThemeMode.system` (the default), so the app follows the phone's light or dark setting. Material widgets (buttons, fields, app bars, dialogs) then take their colours, shapes and text from the theme with no more work. `MotifTheme` fills the `ColorScheme` from the guide's roles and the `TextTheme` from `MotifText`; the colours Material has no slot for come from `MotifColors`.

## Reading theme values in widgets

Widgets you build yourself read the roles directly. Take colours from `MotifColors.of(context)`, which follows light and dark by itself, so a widget never asks which one it is in:

```dart
class PriceTag extends StatelessWidget {
  const PriceTag({super.key, required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    final colors = MotifColors.of(context);
    return DecoratedBox(
      decoration: BoxDecoration(
        color: colors.surfaceRaised,
        borderRadius: BorderRadius.circular(MotifRadius.md),
        border: Border.all(color: colors.border),
        boxShadow: MotifShadows.sm,
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(
          horizontal: MotifSpace.s3,
          vertical: MotifSpace.s1,
        ),
        child: Text(
          label,
          style: MotifText.label.copyWith(color: colors.textPrimary),
        ),
      ),
    );
  }
}
```

- Colours: only roles, and pair them as the guide does (`textPrimary` on `surface`, `onActionPrimary` on `actionPrimary`). Don't use `Colors.white`, `Color(0x…)` or `Theme.of(context).colorScheme.primary` mixed with typed values.
- Sizes: `MotifSpace.sN` for padding, gaps and `SizedBox`; `MotifRadius` for corners. Layout sizes that aren't spacing (an avatar's 40, a divider's thickness) can stay numbers.
- Text: `MotifText.<role>` (`display`, `title`, `heading`, `body`, `label`, `caption`, or whatever the guide names). The roles carry no colour, so add one with `copyWith(color: …)` when the default text colour isn't right, and never set `fontSize` or `fontFamily` yourself.
- `MotifColors.of(context)` falls back to the default colours when no theme is above it (a widget test without `MaterialApp`), so tests don't crash.

## Fonts

`MotifText` loads the theme's fonts for you:

- **Google Fonts** (the usual case): through the `google_fonts` package. Add it once with `flutter pub add google_fonts`. `motif tokens` says when it's missing, and writes a file that compiles in the meantime. Fonts download the first time the app shows them; to work offline, bundle the font files as the [google_fonts documentation](https://pub.dev/packages/google_fonts) describes (an `assets/google_fonts/` folder listed in `pubspec.yaml`).
- **Project fonts** (files in the guide's font files): `motif tokens` copies `.ttf` and `.otf` files into `assets/fonts/` and prints the `fonts:` block to add under `flutter:` in `pubspec.yaml`. Add it by hand, then run `flutter pub get`. Flutter can't use WOFF2; the guide needs a `.ttf` or `.otf` of the family.
- **An Arabic companion** (the second font in a font list) becomes each role's `fontFamilyFallback`, so Arabic letters draw in the right font when the first one doesn't have them. Keep it that way: a hand-written `TextStyle(fontFamily: …)` drops it, which is one more reason `raw-font` is a finding.

An app that wraps the theme itself (to apply another font package) keeps the fallback by passing it on: `.apply(fontFamilyFallback: …)` on the text theme.

## Switching variants

When the guide has design variants, `motif tokens` also writes `enum MotifVariant` (the default first, each id in camelCase), a colour set per variant, and a `variant:` argument on both theme builders. The default is used when you pass nothing:

```dart
theme: MotifTheme.light(variant: MotifVariant.men),
darkTheme: MotifTheme.dark(variant: MotifVariant.men),
```

To let people change it, keep the choice in the app's state and rebuild the `MaterialApp` from it (this uses `ValueNotifier`; use the app's own state package the same way):

```dart
final selectedVariant = ValueNotifier<MotifVariant>(MotifVariant.women);

class App extends StatelessWidget {
  const App({super.key});

  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<MotifVariant>(
      valueListenable: selectedVariant,
      builder: (context, variant, _) => MaterialApp(
        theme: MotifTheme.light(variant: variant),
        darkTheme: MotifTheme.dark(variant: variant),
        home: const HomeScreen(),
      ),
    );
  }
}
```

Save the choice with the app's storage and read it before `runApp`, so no one sees the default flash before their own variant appears. Offer the choice as [the variants guide](../../knowledge/variants.md) says: a neutral label for each variant, easy to change.

- **Variants change colours only on Flutter.** The theme code gives each variant its own colours; fonts, corners, spacing and motion stay the default's. When a variant changes any of those, `motif tokens` says so in its output. Tell the developer once, and keep Flutter variants to colours.
- `MotifTheme.debugVariantOverride` is set by `motif shot` to draw each variant. Leave it `null` in the app.
- An app that already switches its own palettes (not through `MotifTheme`) is shot through `design/states/setup.dart`, which is told the variant ([checks](checks.md#the-setup-file)).
