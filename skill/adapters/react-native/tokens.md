# Theme code

What `motif tokens` writes for an Expo app, how to wire it in, how components read it, how to load the theme's fonts and how to switch between design variants.

## What `motif tokens` writes

One TypeScript file: `design/motif-theme.tsx` (`src/design/` when the app keeps its code in `src/`, or the folder `themeDir` names in `design/motif.json`; see the [README](README.md)). Never edit it; change `design/tokens.json` and run `motif tokens` again. `motif check` reports a hand edit as `generated-edited`. It exports:

| Export | What it is | Use it as |
|---|---|---|
| `MotifProvider` | The component that holds the theme: light or dark from the phone, the variant, the language | `<MotifProvider>` around the app |
| `useMotifTheme()` | A hook: `colors`, `type`, `dark`, `variant` (with variants) and `reducedMotion` | `const { colors, type } = useMotifTheme()` |
| `space`, `radius` | The spacing and corner scales in pixels | `space.s4` (16), `radius.md` |
| `shadow` | Shadows as `{ boxShadow: "…" }` objects | `...shadow.md` in a style |
| `type` | The type roles: font face, size, line height, letter spacing | `...type.body` in a style |
| `typeArabic` | The same roles in the Arabic companion font, when the guide has one | Used by the provider; read it, don't pick it |
| `duration`, `easing`, `spring` | The motion roles ([motion](motion.md)) | `duration.base`, `easing.standard`, `spring.snappy` |
| `motifFonts` | The fonts to load before the first screen | `useFonts(motifFonts)` |
| `motifColors`, `motifVariants`, `MotifVariant` | Every colour set, and the variant ids (when the guide has variants) | Rarely needed directly |

Names are the guide's roles in camelCase (`text-secondary` is `textSecondary`, `0-5` is `s0p5`), and the file lists exactly the roles the guide has. Read the file when unsure which exist; the type-check fails on one that doesn't. `type` is also a plain export, but `useMotifTheme().type` is the same roles, or the Arabic ones in a right-to-left language, so read it from the hook.

## Wiring it in

Wrap the root layout once, load the fonts first, and remove the starter's own theme so it can't override the design guide. With Expo Router this is `app/_layout.tsx`:

```tsx
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";

import { MotifProvider, motifFonts } from "@/design/motif-theme";

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useFonts(motifFonts);

  useEffect(() => {
    if (loaded || error) SplashScreen.hideAsync();
  }, [loaded, error]);

  // Nothing draws before the fonts are ready, so no one sees the system font flash.
  if (!loaded && !error) return null;

  return (
    <MotifProvider>
      <Stack screenOptions={{ headerShown: false }} />
    </MotifProvider>
  );
}
```

`useMotifTheme()` throws, with "wrap your root layout in `<MotifProvider>`", when it runs above the provider; the layout itself is above it, so a component that reads the theme goes below. The provider follows the phone's light or dark setting by itself (`useColorScheme`), so never force a theme. An app whose `app.json` sets `userInterfaceStyle` to `"light"` stays light on the phone, and `motif shot` draws it that way and says so.

**The starter's own theme goes.** A fresh `create-expo-app` project themes itself with a palette file, a colour hook and two themed components. Today's starter keeps them under `src/`: `src/constants/theme.ts`, `src/hooks/use-theme.ts`, `src/components/themed-text.tsx` and `themed-view.tsx`. Starters of SDK 52 and 53 have `constants/Colors.ts`, `hooks/useThemeColor.ts`, `ThemedText.tsx` and `ThemedView.tsx` at the top. Once the app uses the provider, the palette and the hook can go: move each component onto `useMotifTheme()`, then delete them, and the palette stops being a second source of colour. Look in the palette file first: today's `theme.ts` also holds `Spacing`, fonts, `BottomTabInset` and `MaxContentWidth` that the starter's tabs use. Move what is still needed (spacing onto `space`, the fonts onto `type`; the layout constants to a file of their own) before deleting it. `motif check` marks the palette file as "your own theme's palette" until then; don't rewrite it with Motif's roles, list its file under `ignore` in `design/motif.json` while both live side by side. Navigation has colours of its own too. In the current starter `ThemeProvider` comes from `expo-router`; older ones take it from `@react-navigation/native`. Its theme also needs `fonts` and `notification`, so spread `DefaultTheme` or `DarkTheme` and override only `colors` (`background`, `card`, `text`, `border`, `primary`) from `useMotifTheme()`, so headers and tab bars follow the guide.

## Reading theme values in components

Components read the roles directly. Take colours from `useMotifTheme()`, which follows light and dark by itself, so a component never asks which one it is in:

```tsx
import { StyleSheet, Text, View } from "react-native";

import { radius, shadow, space, useMotifTheme } from "@/design/motif-theme";

export function PriceTag({ label }: { label: string }) {
  const { colors, type } = useMotifTheme();
  return (
    <View
      style={[
        styles.tag,
        { backgroundColor: colors.surfaceRaised, borderColor: colors.border },
        shadow.sm,
      ]}
    >
      <Text style={[type.label, { color: colors.textPrimary }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tag: {
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: space.s3,
    paddingVertical: space.s1,
  },
});
```

- Colours: only roles, and pair them as the guide does (`textPrimary` on `surface`, `onActionPrimary` on `actionPrimary`). Don't type `"#fff"`, `"white"` or `rgba(…)`. Colours depend on the scheme, so they go in an inline style next to the static `StyleSheet`.
- Sizes: `space.sN` for padding, margins and gaps; `radius.<role>` for corners. Layout sizes that aren't spacing (an avatar's 40, a divider's thickness) can stay numbers.
- Shadows: `...shadow.md` in a style. These are `boxShadow` strings, which React Native 0.76 and later draws on the New Architecture, on iOS and Android alike, so there is no `shadowColor`, `shadowOffset` or `elevation`.
- Text: `type.<role>` (`display`, `title`, `heading`, `body`, `label`, `caption`, or whatever the guide names). The roles carry no colour: add one in the style. Never set `fontSize` or `fontFamily` yourself. A loaded font is its own family on React Native, so a role names the face for its weight (`Onest_600SemiBold`) and has no `fontWeight`; adding one makes Android fall back to a system font.

## Fonts

`type` uses the theme's fonts by their family names, and `motifFonts` loads them. Call `useFonts(motifFonts)` from `expo-font` before rendering, as the layout above does:

- **Google Fonts** (the usual case): one `@expo-google-fonts/<family>` package per family (`@expo-google-fonts/onest`), whose faces the theme file imports and registers under their own names (`Onest_700Bold`). Add them with `npx expo install expo-font @expo-google-fonts/onest`; `motif tokens` prints the exact line, and writes a file that type-checks in the meantime, using the system font. A package that is listed but not installed gets only its regular (400) face, since every package has that one; install it, then run `motif tokens` again to get the other weights. The fonts are in the app, not downloaded, so they work offline.
- **Project fonts** (files in the guide's font files): `motif tokens` copies `.ttf` and `.otf` files into `assets/fonts/` and `require`s them in `motifFonts`. React Native can't use WOFF2; the guide needs a `.ttf` or `.otf` of the family.
- **An Arabic companion** (the second font in a font list) becomes `typeArabic`. The provider uses it when the language reads right to left (`I18nManager.isRTL`, the device's locale, or the page's `dir` on the web), so Arabic letters draw in the right font when the first one doesn't have them. A hand-written `fontFamily` skips it, which is one more reason `raw-font` is a finding.

## Switching variants

When the guide has design variants, `motif tokens` also writes `MotifVariant` (a union of the ids, the default first, each as written in the guide: `"partner-store"` stays quoted), `motifVariants`, a colour set per variant, and a `variant` prop on `MotifProvider`. The default is used when you pass nothing:

```tsx
<MotifProvider variant="partner">
  <Stack />
</MotifProvider>
```

To let people change it, keep the choice in the app's state (here `useState`; use the app's own state library the same way) and pass it to the provider:

```tsx
import { Stack } from "expo-router";
import { useState } from "react";

import { MotifProvider, type MotifVariant } from "@/design/motif-theme";

export default function RootLayout() {
  const [variant, setVariant] = useState<MotifVariant>("women");
  // Hand setVariant to the settings screen through a context or the app's store.
  return (
    <MotifProvider variant={variant}>
      <Stack />
    </MotifProvider>
  );
}
```

Save the choice with the app's storage (AsyncStorage, say) and read it before the first render, as the layout holds the splash screen for the fonts, so no one sees the default flash before their own variant appears. Offer the choice as [the variants guide](../../knowledge/variants.md) says: a neutral label for each variant, easy to change.

- **Variants change colours only on React Native.** The theme code gives each variant its own colours; fonts, corners, spacing and motion stay the default's. When a variant changes any of those, `motif tokens` says so in its output. Tell the developer once, and keep React Native variants to colours.
- **On the web target** a `data-variant` attribute on `<html>` wins over the prop. That is how `motif shot` draws each variant, the default's too; the app needs nothing for it, and on a phone the attribute doesn't exist.
- An app that already switches its own palettes (not through `MotifProvider`) is shot with a state script that sets what its screens read ([checks](checks.md#screens-behind-a-form-or-a-tap)).
