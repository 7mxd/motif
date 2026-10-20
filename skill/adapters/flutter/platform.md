# Platform rules

What to get right on every Flutter app: Android and iOS conventions, right-to-left languages, safe areas, text size, phone and tablet layouts, and accessibility. Where the app differs between platforms or apps on purpose, write it in `DESIGN.md` section 8, the platform notes.

## Android and iOS

One theme serves both, and the app should still feel at home on each: **Material 3 on Android and Cupertino conventions on iOS**. Material widgets already adapt much of this: page transitions, scroll physics and the back gesture follow the platform. Keep that, and add:

- **Adaptive controls** where the platform has its own: `Switch.adaptive`, `Slider.adaptive`, `CircularProgressIndicator.adaptive`, `showAdaptiveDialog`, and `Icons.adaptive.arrow_back` or `Icons.adaptive.share` for icons that differ (a back chevron on iOS, an arrow on Android).
- **Navigation**: swipe back from the left edge on iOS and the system back on Android both have to work, so never block them with a custom gesture. A bottom `NavigationBar` serves both.
- **Sheets, pickers and alerts**: iOS people expect bottom sheets with a grabber and dialogs with stacked actions; Android a Material dialog. `showAdaptiveDialog` and `showModalBottomSheet` get close.
- **Tap areas**: at least 44 by 44 logical pixels (Apple's size) everywhere; Material's 48 is a good default.
- **Type**: the guide's fonts are used on both platforms, not each system's. Don't add platform fonts on top.
- **Haptics**: `HapticFeedback.selectionClick()` on a toggle or a pick; never on every tap.

Check the platform when it changes more than a widget:

```dart
final onIos = Theme.of(context).platform == TargetPlatform.iOS;
```

`motif shot` draws screens as Android (Material, Roboto where the guide has no font), because Apple's system font can't be shipped. Say so when showing pictures of a screen that is mainly for iPhones, and check the iOS look on a simulator when it matters.

## Right to left

Arabic and Hebrew read right to left, and Flutter mirrors a screen by itself when the locale is one of them, if the layout is written in terms of *start* and *end* rather than left and right. A `Directionality` widget above the screen gives the direction, and everything below reads it:

| Instead of | Use |
|---|---|
| `EdgeInsets.only(left: …)` | `EdgeInsetsDirectional.only(start: …)` |
| `Alignment.centerLeft` | `AlignmentDirectional.centerStart` |
| `TextAlign.left` | `TextAlign.start` |
| `BorderRadius.only(topLeft: …)` | `BorderRadiusDirectional.only(topStart: …)` |
| `Positioned(left: …)` | `PositionedDirectional(start: …)` |

```dart
Padding(
  padding: const EdgeInsetsDirectional.only(
    start: MotifSpace.s4,
    end: MotifSpace.s2,
  ),
  child: Align(
    alignment: AlignmentDirectional.centerStart,
    child: Text('Total', textAlign: TextAlign.start, style: MotifText.label),
  ),
)
```

- Icons that point a direction (back, next) flip by themselves when their icon is marked to match the text direction (`Icons.arrow_back` and `Icons.arrow_forward` are); for your own image, set `matchTextDirection: true` on it. Icons that don't point (search, a clock) stay.
- Numbers, phone numbers and Latin names inside Arabic text keep their own direction; Flutter handles it, so don't reverse strings by hand.
- The Arabic font comes from the theme's fonts ([theme code](tokens.md#fonts)); a screenshot with squares instead of letters means the family has no Arabic and no fallback.
- Check it with `motif shot --rtl` ([checks](checks.md#right-to-left)).

## Languages

An app that offers Arabic (or any other language) lists its locales on the `MaterialApp`, with the delegates that translate Flutter's own text:

```dart
MaterialApp(
  theme: MotifTheme.light(),
  darkTheme: MotifTheme.dark(),
  localizationsDelegates: AppLocalizations.localizationsDelegates,
  supportedLocales: AppLocalizations.supportedLocales,
  home: const HomeScreen(),
)
```

`supportedLocales` is what Flutter checks to pick the phone's language; without `ar` in it, an Arabic phone gets the app left to right. `flutter gen-l10n` writes `AppLocalizations` from `.arb` files (set `generate: true` in `pubspec.yaml`). Write user-facing text in those files, not in widgets.

## Safe areas, keyboards and text size

- `Scaffold` handles the status bar and app bar. Anything outside one (a full-screen image, a custom bottom bar) goes inside `SafeArea`, so the notch, the home indicator and rounded corners don't cover it.
- A form scrolls: wrap it in a `SingleChildScrollView` or a `ListView`, so the keyboard never hides the field being typed in. Keep `Scaffold.resizeToAvoidBottomInset` on.
- Text grows when people raise their system text size, up to 200 percent or more. Don't give text a fixed height, don't set `textScaler` to a constant, and check the screens at the largest size: nothing is cut off, overlaps or becomes untappable. Long labels wrap or ellipsize (`maxLines`, `overflow`) rather than overflow.

## Phones and tablets

`motif shot` draws three phone widths (360, 390 and 430) and a tablet (768). Lay out from the space the widget gets, not the device:

```dart
class AppShell extends StatelessWidget {
  const AppShell({super.key, required this.body});

  final Widget body;

  @override
  Widget build(BuildContext context) {
    final wide = MediaQuery.sizeOf(context).width >= 600;
    const destinations = [
      NavigationRailDestination(icon: Icon(Icons.home_outlined), label: Text('Home')),
      NavigationRailDestination(icon: Icon(Icons.settings_outlined), label: Text('Settings')),
    ];
    return Scaffold(
      body: Row(
        children: [
          if (wide)
            NavigationRail(
              selectedIndex: 0,
              labelType: NavigationRailLabelType.all,
              destinations: destinations,
            ),
          Expanded(child: body),
        ],
      ),
      bottomNavigationBar: wide
          ? null
          : NavigationBar(
              selectedIndex: 0,
              destinations: const [
                NavigationDestination(icon: Icon(Icons.home_outlined), label: 'Home'),
                NavigationDestination(icon: Icon(Icons.settings_outlined), label: 'Settings'),
              ],
            ),
    );
  }
}
```

The phone's tab bar becomes a side rail on the tablet. A single column of content that stretches across a tablet gets a maximum width (`ConstrainedBox`, `maxWidth`), not wider lines.

## Accessibility

- Names: [components](components.md#names-and-tap-areas). Every control has one, and `motif shot --audit` reports ones without ([checks](checks.md#names)).
- `Semantics` groups and orders what a screen reader reads. `MergeSemantics` makes a row of an icon and its text one stop; `ExcludeSemantics` hides decoration.
- Colour is never the only signal: an error has text, a selected tab has a shape or weight change too.
- Contrast is the guide's job and the audit's ([checks](checks.md#contrast)); use the text role the guide pairs with the surface.
- Reduced motion: [motion](motion.md#reduced-motion).
- Dark mode follows the phone. Never force a theme.
