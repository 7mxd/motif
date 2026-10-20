import { useFonts } from "expo-font";
import { Stack } from "expo-router";

import { MotifProvider, motifFonts, type MotifVariant } from "../design/motif-theme";

// The app picks its own variant, as an app built for one partner does. Motif's screenshots still draw the variant each
// one names, because the theme follows data-variant on the web.
const BRAND: MotifVariant = "partner";

export default function RootLayout() {
  const [loaded] = useFonts(motifFonts);
  if (!loaded) return null;
  return (
    <MotifProvider variant={BRAND}>
      <Stack screenOptions={{ headerShown: false }} />
    </MotifProvider>
  );
}
