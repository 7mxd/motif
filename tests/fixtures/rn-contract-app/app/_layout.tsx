import { Ionicons } from "@expo/vector-icons";
import { useFonts } from "expo-font";
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from "expo-router";
import { StatusBar } from "expo-status-bar";

import { SHOP } from "@/data/catalogue";
import { MotifProvider, motifFonts, useMotifTheme } from "@/design/motif-theme";
import { ShopProvider } from "@/state/shop";

/** Expo Router's own colours (screen backgrounds between transitions), from the theme. */
function Navigation() {
  const { colors, dark } = useMotifTheme();
  const base = dark ? DarkTheme : DefaultTheme;
  const theme = {
    ...base,
    colors: { ...base.colors, background: colors.background, card: colors.surface, text: colors.textPrimary, border: colors.border, primary: colors.actionPrimary },
  };
  return (
    <ThemeProvider value={theme}>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false }} />
    </ThemeProvider>
  );
}

export default function RootLayout() {
  const [loaded, error] = useFonts({ ...motifFonts, ...Ionicons.font });
  // Nothing draws before the fonts are ready, so no one sees the system font flash.
  if (!loaded && !error) return null;
  return (
    <MotifProvider variant={SHOP.marketNight ? "night-market" : "default"}>
      <ShopProvider>
        <Navigation />
      </ShopProvider>
    </MotifProvider>
  );
}
