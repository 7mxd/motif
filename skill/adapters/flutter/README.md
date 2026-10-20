# Flutter

How Motif works with a Flutter app: what it expects, how to start one, where things live, and how to build and run it. Motif's theme code for Flutter is plain Dart that sits beside your widgets; nothing else is added to the app.

## What Motif expects

- A Flutter app in Dart, with Material 3 widgets (`MaterialApp`, `ThemeData(useMaterial3: true)`). Motif's generated theme plugs into `MaterialApp`'s `theme` and `darkTheme`.
- Flutter 3.27 or newer. The theme code uses newer `ColorScheme` roles than older versions have.
- One design guide for the whole project. Motif writes the same theme for Android and iOS; [platform rules](platform.md) says what to keep different on purpose.

## How Motif recognises it

A folder is a Flutter app when it has a `pubspec.yaml` that depends on the Flutter SDK, and either a main file (`lib/main.dart`, or a flavour's `lib/main_dev.dart`) or platform folders (`android/`, `ios/`, …). A Flutter project with neither is a **package**: shared code that apps depend on. `motif doctor --json` lists the apps, with the stack `flutter`, and leaves the packages out.

`motif doctor` also checks the toolchain, and tells the developer what it finds in one line: `Flutter SDK`, ok, "Flutter 3.44.8 (Dart 3.12.2)." If Flutter isn't installed, the same line is marked as needed: theme code, checks and drafts work without it, but screenshots need it, so tell the developer to install it from https://docs.flutter.dev/get-started/install. An older Flutter than 3.27 gets `flutter upgrade`.

## Starting a new project

```bash
flutter create --org com.example --platforms android,ios my_app
```

`--org` names the app's package (`com.example.my_app`); ask the developer for their own reverse-domain name instead of leaving `com.example`. The new `my_app` folder is the project: move the `design/` folder into it (the `motif` commands run from there), then run `motif tokens`.

`flutter create` already adds `flutter_test` to `dev_dependencies`, which `motif shot` needs. If the theme uses fonts from Google Fonts, add the package once:

```bash
flutter pub add google_fonts
```

## Folders

- **Theme code:** `lib/design/motif_theme.dart`, written by `motif tokens`. Never edit it by hand ([theme code](tokens.md)).
- **Reusable widgets:** `lib/widgets/`; a feature's own widgets go in `lib/features/<feature>/widgets/` ([components](components.md)).
- **Fonts the theme brings:** `assets/fonts/`, listed in `pubspec.yaml` by hand (`motif tokens` prints the lines to add).
- **The design guide:** `DESIGN.md` and `design/` in the project folder. Screenshot helpers live in `design/states/` ([checks](checks.md#screens-behind-a-form-or-a-click)).

`design/motif.json` can name a different theme folder when the code isn't laid out this way: `themeDir` is a folder inside the project, written from the project's top.

```json
{ "motifContract": 1, "apps": [{ "path": ".", "stack": "flutter", "themeDir": "lib/theme" }] }
```

## Monorepos

Real projects often hold several apps. Say a pnpm workspace has a web dashboard in `dashboard/`, and `mobile/` holds two Flutter apps (`mobile/customer`, `mobile/admin`), a shared package (`mobile/packages/core`) and maybe an Expo app. `motif doctor` finds each app on its own. Keep **one guide for the web dashboard and the Flutter app**: one `DESIGN.md` and one `design/tokens.json` at the project's top. `DESIGN.md`'s platform notes say, per app, what differs on purpose (the customer app uses bottom tabs, the dashboard a sidebar), as section 8 of the template asks.

For apps that share widgets, put the theme in the shared package and tell Motif once, in `design/motif.json`:

```json
{
  "motifContract": 1,
  "apps": [
    { "path": "mobile/customer", "stack": "flutter", "themeDir": "mobile/packages/core/lib/design" },
    { "path": "mobile/admin", "stack": "flutter", "themeDir": "mobile/packages/core/lib/design" }
  ]
}
```

Then `motif tokens` writes one `motif_theme.dart` into the package, and both apps import it as `package:core/design/motif_theme.dart` (the package has to be a dependency of each app, with `path: ../packages/core`). `motif check` and `motif extract` also read the Dart in the path dependencies under `mobile/packages`, one level deep, so shared widgets are checked too. Run `flutter pub get` in each app after changing a dependency.

## Build, type-check and run

- `flutter analyze`: the compiler and linter. Run it after every change; it must report no issues.
- `flutter test`: the app's own tests. `motif shot` also runs `flutter test` to draw screens, so the SDK and `flutter_test` in `dev_dependencies` have to be there. Motif never edits `pubspec.yaml`: when `flutter_test` is missing it stops and shows the three lines to add.
- `flutter run`: runs the app on a device, simulator or emulator. `motif shot` needs none of them. It draws each screen in a test, at every size, light and dark, with the app's real fonts, and the look is Android's.
- Each route is a screen: Motif reads `GoRoute` paths (nested ones joined to their parent's) and a `MaterialApp`'s `routes:` map. A screen that isn't a route is shot by its widget's name with `--screen` ([checks](checks.md)).

## The rest of this guide

- [Theme code](tokens.md): what `motif tokens` writes, using it, fonts and switching variants.
- [Components](components.md): building widgets the Flutter way, and the starter set.
- [Motion](motion.md): the motion roles in Flutter's animation API, springs and reduced motion.
- [Platform rules](platform.md): Android and iOS conventions, right to left, text and accessibility.
- [Checks and screenshots](checks.md): fixing what `motif check` and `motif shot --audit` report, and the screenshot helper files.
