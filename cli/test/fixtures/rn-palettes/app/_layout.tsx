import { Onest_400Regular } from '@expo-google-fonts/onest';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';

export default function RootLayout() {
  const [loaded] = useFonts({ Onest_400Regular, SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf') });
  if (!loaded) return null;
  return <Stack />;
}
