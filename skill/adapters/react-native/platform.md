# Platform rules

What to get right on every Expo app: iOS and Android conventions, right-to-left languages, safe areas, text size, phone and tablet layouts, and accessibility. Where the app differs between platforms or apps on purpose, write it in `DESIGN.md` section 8, the platform notes.

## iOS and Android

One theme serves both, and the app should still feel at home on each. React Native draws the platform's own controls for many things; keep that, and add:

- **Navigation**: swipe back from the left edge on iOS and the system back on Android both have to work, so never block them with a custom gesture. Expo Router's `Stack` and `Tabs` use the platform's transitions; a bottom tab bar serves both.
- **Controls**: `Switch` is the platform's own on each. `ActivityIndicator` too. A date or time picker is native (`@react-native-community/datetimepicker`), which the web target can't show.
- **Sheets, pickers and alerts**: iOS people expect bottom sheets with a grabber and dialogs with stacked actions; Android a Material dialog. `Alert.alert` and `Modal` with `presentationStyle` get close.
- **Ripple and press**: `android_ripple` on a `Pressable` is Android's touch feedback; iOS gets a dimmed press from the style callback. Write both ([components](components.md#every-state)).
- **Tap areas**: at least 44 by 44 points (Apple's size) everywhere; Material's 48 is a good default.
- **Type**: the guide's fonts are used on both platforms, not each system's. Don't add platform fonts on top.
- **Haptics**: `expo-haptics`' `selectionAsync()` on a toggle or a pick; never on every tap.
- **Status bar and keyboard**: `StatusBar` from `expo-status-bar` set to `auto` follows the scheme.

Check the platform when it changes more than a component:

```tsx
import { Platform } from "react-native";

const onIos = Platform.OS === "ios";
```

`motif shot` draws screens through Expo's web target, so it can't show San Francisco, Roboto or native navigation chrome ([README](README.md#build-type-check-and-run)). Say so when showing pictures of a screen that is mainly for iPhones, and check the native look on a simulator when it matters.

## Right to left

Arabic and Hebrew read right to left. React Native mirrors a layout by itself when `I18nManager.isRTL` is on and the styles are written in terms of *start* and *end* rather than left and right:

| Instead of | Use |
|---|---|
| `marginLeft`, `marginRight` | `marginStart`, `marginEnd` |
| `paddingLeft`, `paddingRight` | `paddingStart`, `paddingEnd` |
| `left`, `right` | `start`, `end` |
| `borderTopLeftRadius` | `borderTopStartRadius` |
| `textAlign: "left"` | `textAlign: "auto"`, or leave it out |
| `flexDirection: "row"` | the same: a row already reads from the start |

```tsx
import { StyleSheet, Text, View } from "react-native";

import { space, useMotifTheme } from "@/design/motif-theme";

export function TotalRow({ amount }: { amount: string }) {
  const { colors, type } = useMotifTheme();
  return (
    <View style={styles.row}>
      <Text style={[type.label, { color: colors.textSecondary }]}>Total</Text>
      <Text style={[type.body, { color: colors.textPrimary }]}>{amount}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingEnd: space.s2,
    paddingStart: space.s4,
  },
});
```

- **Switching the direction needs a reload on a phone.** `I18nManager.allowRTL(true)` and `I18nManager.forceRTL(true)` take effect the next time the app starts, so a language switch inside the app calls them and then `Updates.reloadAsync()` from `expo-updates`. `expo-localization` reads the phone's language and whether it is right to left (`getLocales()[0].textDirection`). Call `I18nManager.allowRTL(true)` at start-up so a phone set to Arabic mirrors the app, and declare the app's languages in `expo-localization`'s config plugin (`supportedLocales` in `app.json`), which iOS needs to offer them in Settings.
- Icons that point a direction (back, next) have to flip: add `transform: [{ scaleX: I18nManager.isRTL ? -1 : 1 }]` to the icon. Icons that don't point (search, a clock) stay.
- Numbers, phone numbers and Latin names inside Arabic text keep their own direction; the text engine handles it, so don't reverse strings by hand.
- The Arabic font comes from the theme's fonts ([theme code](tokens.md#fonts)); a screenshot with squares instead of letters means the family has no Arabic and no companion.
- **Motif's screenshots** use the web target, where `I18nManager.forceRTL` does nothing. `motif shot --rtl` sets the page's language and `dir="rtl"` itself, so flex rows mirror as they would on a phone, and says so in its notes. An app that picks Arabic from a stored setting, not the locale, needs a state script to set it ([checks](checks.md#right-to-left)).

## Languages

Write user-facing text in a table keyed by language, not in components, and pick the language from the phone:

```tsx
import { getLocales } from "expo-localization";

const strings = {
  en: { total: "Total" },
  ar: { total: "الإجمالي" },
};

export function useStrings() {
  const code = getLocales()[0]?.languageCode ?? "en";
  return code === "ar" ? strings.ar : strings.en;
}
```

An app of any size uses a library (`i18next` with `react-i18next`, or `expo-localization` with `i18n-js`) and follows Expo's [localization guide](https://docs.expo.dev/guides/localization/), which changes between releases.

## Safe areas, keyboards and text size

- Anything outside a navigator's own header or tab bar (a full-screen image, a custom bottom bar) goes inside `SafeAreaView` from `react-native-safe-area-context`, not React Native's own, which only works on iOS. Expo Router's starter already includes the package. Wrap the app in `SafeAreaProvider` once if it isn't (Expo Router does it for you), and use `useSafeAreaInsets()` for padding the notch and the home indicator would cover.
- A form scrolls: wrap it in a `ScrollView` with `keyboardShouldPersistTaps="handled"`, and a `KeyboardAvoidingView` (`behavior="padding"` on iOS), so the keyboard never hides the field being typed in.
- Text grows when people raise their system text size, up to 200 percent or more. Don't give text a fixed height, don't set `allowFontScaling={false}` as a habit, and check the screens at the largest size: nothing is cut off, overlaps or becomes untappable. Long labels wrap or ellipsize (`numberOfLines`, `ellipsizeMode`) rather than overflow.

## Phones and tablets

`motif shot` draws three phone widths (360, 390 and 430) and a tablet (768). Lay out from the space the component gets, not the device, with `useWindowDimensions()`:

```tsx
import { type ReactNode } from "react";
import { StyleSheet, useWindowDimensions, View } from "react-native";

import { space } from "@/design/motif-theme";

export function Shell({ nav, body }: { nav: ReactNode; body: ReactNode }) {
  const { width } = useWindowDimensions();
  const wide = width >= 600;
  return (
    <View style={[styles.shell, wide ? styles.rail : styles.stack]}>
      {wide ? <View style={styles.sideNav}>{nav}</View> : null}
      <View style={styles.body}>{body}</View>
      {wide ? null : nav}
    </View>
  );
}

const styles = StyleSheet.create({
  shell: { flex: 1 },
  rail: { flexDirection: "row" },
  stack: { flexDirection: "column" },
  sideNav: { padding: space.s4 },
  body: { flex: 1 },
});
```

The phone's tab bar becomes a side rail on the tablet. A single column of content that stretches across a tablet gets a maximum width (`maxWidth` with `alignSelf: "center"`), not wider lines.

## Accessibility

- Names: [components](components.md#names-and-tap-areas). Every control has one, and `motif shot --audit` reports ones without ([checks](checks.md#names)).
- `accessible` groups what a screen reader reads as one stop (an icon and its text); `accessibilityElementsHidden` and `importantForAccessibility="no-hide-descendants"` hide decoration.
- Colour is never the only signal: an error has text, a selected tab has a shape or weight change too.
- Contrast is the guide's job and the audit's ([checks](checks.md#contrast)); use the text role the guide pairs with the surface.
- Reduced motion: [motion](motion.md#reduced-motion).
- Dark mode follows the phone. Never force a theme.
