# Checks and screenshots

What `motif check` and `motif shot --audit` report in a Flutter app, how to fix each finding, and the files that let `motif shot` reach screens behind a tap or a fetch.

`motif check` reads the app's Dart code, and the Dart of the packages it depends on from the project (`path:` dependencies, one level). Comments and the insides of strings are not code, so a colour in a comment is fine; code inside `${…}` in a string is read. Every finding names the file, line and column. These aren't read: `.dart_tool/`, `build/`, `test/`, `integration_test/`, `*.g.dart`, `*.freezed.dart`, `*.mocks.dart`, `*.gr.dart`, `lib/generated/` and `lib/l10n/app_localizations*.dart`.

A value that truly must stay as it is (a colour the user picks, a partner's brand colour) gets a `// motif-ok: <reason>` comment on its line or the line above. `motif check` lists these exceptions separately instead of as problems. Keep them rare, and always give the reason:

```dart
// motif-ok: the partner's brand colour, fixed by their licence
const partnerBlue = Color(0xFF0057B8);
```

## `raw-color`

A colour typed into widget code.

- Example: `Color(0xFF8A8A8A)`, `Color.fromRGBO(0, 0, 0, 0.5)`, `Colors.white`, `Colors.grey.shade600`, `CupertinoColors.systemRed`. (`Colors.transparent` is fine.)
- Fix: the colour role it stands for, `MotifColors.of(context).<role>`. Each finding names the nearest role.

```dart
final colors = MotifColors.of(context);
return ColoredBox(
  color: colors.surface,
  child: Text(
    'Prices include tax',
    style: MotifText.caption.copyWith(color: colors.textSecondary),
  ),
);
```

## `off-scale`

A spacing, corner or text size that isn't on the theme's scales. A number that is on a scale (`EdgeInsets.all(16)`) is seen but allowed, since the build stays correct; still prefer the role, so a change to the guide arrives everywhere.

- Example: `EdgeInsets.all(13)`, `SizedBox(height: 18)`, `Column(spacing: 6, …)`, `BorderRadius.circular(10)`, `fontSize: 15`.
- Fix: the nearest step, `MotifSpace.s4`, `MotifRadius.md`, or a text role's `MotifText.body`. If the design truly needs a new step, propose a change to the design guide instead. Layout sizes that aren't spacing (an avatar's width and height) aren't read.

```dart
Padding(
  padding: const EdgeInsets.all(MotifSpace.s4),
  child: Column(
    spacing: MotifSpace.s2,
    children: [
      DecoratedBox(
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(MotifRadius.md),
        ),
        child: Text('Order shipped', style: MotifText.body),
      ),
      const SizedBox(height: MotifSpace.s3),
    ],
  ),
)
```

## `raw-font`

A font family typed into widget code.

- Example: `fontFamily: 'Georgia'`, `GoogleFonts.lato()`, `GoogleFonts.getFont('Inter')`, `fontFamilyFallback: ['Roboto']`.
- Fix: a text role, `MotifText.body`, which already has the theme's fonts and their fallback. For a code font the guide's `font.mono` role; if the theme has none, propose adding it as a design guide change.

```dart
Text('#A1429', style: MotifText.label)
```

## `raw-motion`

A duration, easing curve or spring typed into an animation.

- Example: `duration: Duration(milliseconds: 300)`, `curve: Curves.easeIn`, `Cubic(0.4, 0, 0.2, 1)`, `SpringDescription(mass: 1, stiffness: 100, damping: 10)`.
- Fix: `MotifDurations.<role>` (through `MotifMotion.duration(context, …)`), `MotifCurves.<role>` and `MotifSprings.<role>` ([motion](motion.md)).
- Not motion, so not findings: `Curves.linear`, a `Duration` that is a timer (`Timer`, `Future.delayed`, a timeout or a debounce), and how long a `SnackBar`, `MaterialBanner` or `Tooltip` stays up.

```dart
AnimatedOpacity(
  opacity: visible ? 1 : 0,
  duration: MotifMotion.duration(context, MotifDurations.fast),
  curve: MotifCurves.standard,
  child: const Text('Saved'),
)
```

## `reduced-motion`

The app animates (an `AnimationController`, an `Animated…` widget, `TweenAnimationBuilder`, `Hero`), but nothing in its own code respects the "reduce motion" setting.

- Fix: build durations with `MotifMotion.duration(context, …)`, which is zero when the setting is on, or read `MediaQuery.disableAnimationsOf(context)` ([motion](motion.md#reduced-motion)). One use anywhere in the app's code satisfies the check; the audit below looks at each screen.

```dart
AnimatedScale(
  scale: pressed ? 0.96 : 1,
  duration: MotifMotion.duration(context, MotifDurations.fast),
  child: child,
)
```

## `generated-edited`

`motif_theme.dart` was edited by hand.

- Fix: move the change into `design/tokens.json` (as a design guide change, if it's new), then run `motif tokens` to write the file again.

## Contrast

From `motif shot --audit`: text measured as drawn below 4.5:1 (3:1 for large text: 24 px, or 18.66 px bold), and icons below 3:1 (an icon is a mark, not text: WCAG 1.4.11). Motif reads each piece of text's colour and the pixels behind it in the screenshot. An icon's finding names it as an icon: by its `semanticLabel`, Flutter's own name (`Icons.star`) or its code point.

- Fix: use the text role the design guide pairs with that surface (`textPrimary` on `surface`, `onActionPrimary` on `actionPrimary`). If a pair itself fails, `motif validate` reports it too, and the role values need changing.
- Text over a photo or a gradient has no single background, so it is left out; look at those screens by eye. Text in a disabled control is left out too, and so is text something else is drawn over (a floating tab bar, a dialog's barrier), text over an image the screenshot doesn't show (one that hasn't loaded, or that `design/states/http.json` doesn't answer), and text with no letters or digits (a `·` between two facts).
- Fix an icon the same way: an icon colour role with 3:1 on its surface.

```dart
Text(
  'Delivery times are estimates',
  style: MotifText.caption.copyWith(color: MotifColors.of(context).textSecondary),
)
```

## Target size

From `motif shot --audit`: a tappable control smaller than 44×44 logical pixels, on the phone and tablet sizes. Links inside text are left out. (Flutter has no 24 px check at the desktop size, so `--sizes desktop` reports contrast and names only.)

- Fix: more padding, `minimumSize` in the button's style, or a `SizedBox` of 44 or more around a small icon:

```dart
Semantics(
  button: true,
  label: 'Remove',
  child: InkResponse(
    onTap: onRemove,
    child: const SizedBox(
      width: 44,
      height: 44,
      child: Center(child: Icon(Icons.close, size: 18)),
    ),
  ),
)
```

## Names

From `motif shot --audit`: a tappable control or text field with no name a screen reader can say. The finding is reported in the review format under the category `accessibility`.

- Fix: a visible label, a `tooltip:` (an `IconButton` takes one), or `Semantics(label: …)`. A text field's `labelText` or `hintText` names it.
- A tap area over (nearly) the whole screen that isn't a button, link or field, such as a `GestureDetector` that closes the keyboard, isn't a control anyone aims at, so it needs no name.

```dart
IconButton(
  tooltip: 'Open menu',
  onPressed: onMenu,
  icon: const Icon(Icons.menu),
)
```

## Reduced motion

From `motif shot --audit`: with the "reduce motion" setting on, something on the screen keeps animating. Motif draws every screenshot with the setting on, so a screen caught while loading shows its still state, and a spinner left running is reported. This is stricter than the web's check, which allows fades and colour changes: Flutter doesn't say what changed from one frame to the next, so any animation that keeps going is reported, a looping fade and a spinner included. The finding names the widget that rebuilds.

- Fix: stop it, or show its still frame, when `MotifMotion.reduced(context)` is true ([motion](motion.md#skeletons)). Animations built from `MotifMotion.duration(context, …)` finish at once and don't show up.

## Screens behind a form or a click

`motif shot` draws each route as it first appears. A screen that only appears after someone fills in a form, taps a tab or waits for the network needs a **state script** (a few lines of Dart that get the screen there), and may need the setup file and fake network answers below. Keep the scripts in `design/states/`, named after the state (letters, digits and dashes), and add `--state design/states/<state>.dart` for each.

A state script defines `motifState`. Motif calls it on each screen once it has opened, with the test's `WidgetTester`:

```dart
// design/states/sent.dart: the contact page after the form is sent.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

Future<void> motifState(WidgetTester tester) async {
  final field = find.byType(TextField);
  if (field.evaluate().isEmpty) return; // Only the contact page has the field.
  await tester.enterText(field.first, 'maya@example.com');
  await tester.tap(find.text('Send'));
  await tester.pump(const Duration(milliseconds: 500));
}
```

```bash
motif shot --routes /contact --state design/states/sent.dart
```

- It runs on every screen `motif shot` draws: start with a guard that returns on the others, or capture only its screen with `--routes`.
- Screenshots are named after the screen and the state (`contact@sent.mobile.png`), each starting from a fresh visit. Use the same `--state` options for `--save` and `--against`.
- Use `tester.pump(Duration)`, not `pumpAndSettle`, on a screen with a spinner or a loop: it never settles. A script that is still running after 15 seconds is left behind and reported. An error it throws is the screen's error, and the screenshot is still taken.
- Mock data only.

### The setup file

`design/states/setup.dart` runs once before the app starts, for every screenshot (each size, scheme, variant and direction). It is how a screen is reached that depends on who is signed in, what is stored, or which palette a variant is. It defines this function and returns `null` to start the app as usual, or a widget to start instead of `main()` (wrapped in the app's providers, say):

```dart
// design/states/setup.dart
import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:my_app/state.dart';

Future<Widget?> motifSetup({required String variant, required Locale locale, required Brightness brightness}) async {
  // ignore: invalid_use_of_visible_for_testing_member
  SharedPreferences.setMockInitialValues({'signedIn': true});
  // An app that switches its own palette is told the variant's id ("" with no variants).
  AppPalette.current = variant == 'men' ? Palette.men : Palette.women;
  return null;
}
```

It has 15 seconds. Because every screenshot in a run shares the app's global objects (a router, a singleton), reset any of yours here.

### Fake network answers

An app's network requests never leave the test. `design/states/http.json` says what to answer, keyed by method and path (any host) or by a whole address, with a file under `design/` and, if it isn't 200, a status:

```json
{
  "GET https://api.example.com/items": "fixtures/items.json",
  "GET /orders": { "file": "fixtures/orders.json" },
  "POST /orders": { "status": 201 }
}
```

A request nothing answers gets a 404 and a note naming it (an image gets a blank picture). Storage and device plugins that many apps use (`shared_preferences`, `flutter_secure_storage`, `path_provider`, `package_info_plus`, `connectivity_plus`, `url_launcher`) are answered with empty values. Any other plugin makes that screen report an error pointing here: stub it in `motifSetup`.

### Screens that aren't routes

`--routes` draws routes (go_router's paths and a `MaterialApp`'s `routes:`). A widget that is a screen without a route (a sheet's content, a page opened with `Navigator.push`) is drawn by name:

```bash
motif shot --screen SettingsScreen
```

The class has to be public, a widget, and openable as `SettingsScreen()` with no arguments; Motif says what to change when it isn't.

## Right to left

`motif shot --rtl` takes every screenshot a second time in Arabic, right to left (`--rtl he` for Hebrew), named with `.rtl`, and the audit covers them too. If the app's `supportedLocales` doesn't include the language, the screenshots are still taken but show it left to right, and `motif shot` says so ([platform](platform.md#languages)).

```bash
motif shot --audit --rtl
```

## Reading the results

Run both with `--json`. `motif check` lists `violations` (each with its file, line, rule and fix), `exceptions` and `warnings`. `motif shot --audit` writes its findings to `design/shots/audit.json` in the review format, with the screen, the widget and a screenshot. `motif shot` needs the Flutter SDK and `flutter_test` in `dev_dependencies`, and draws the Android look. Fix what they report, then run them again until both are clean; `flutter analyze` too.
