import { resolve } from "node:path";
import type { DoctorDeps, DoctorItem } from "../../commands/doctor";
import type { AppInfo } from "../../detect/stacks";
import { expoSdk, hasWebSupport, isExpoApp } from "./project";

/** The oldest Expo SDK whose theme API Motif's generated code uses. */
export const EXPO_MIN_SDK = 52;
const LABEL = "Expo web target";
export const WEB_INSTALL = "npx expo install react-dom react-native-web @expo/metro-runtime";

/** Doctor items for the React Native apps: the Expo SDK and the web target's packages (screenshots use it). */
export function rnDoctor(_deps: DoctorDeps, ctx?: { root: string; apps: AppInfo[] }): DoctorItem[] {
  const apps = (ctx?.apps ?? []).filter((a) => a.stack === "react-native");
  const dirs = apps.map((a) => resolve(ctx!.root, a.path));
  const expo = dirs.filter(isExpoApp);
  const items: DoctorItem[] = [];

  if (dirs.length > expo.length) {
    items.push({
      id: "react-native",
      status: "optional",
      label: "React Native",
      detail: "React Native without Expo isn't supported: Motif supports Expo apps (spec non-goal). Theme code, checks and drafts still work; screenshots need Expo's web target.",
    });
  }

  // One item for all the Expo apps: the first problem found, else the first app's SDK.
  for (const dir of expo) {
    const sdk = expoSdk(dir);
    if (sdk !== null && sdk < EXPO_MIN_SDK) {
      items.push({ id: "expo-web", status: "needed", label: LABEL, detail: `Expo SDK ${sdk} is older than ${EXPO_MIN_SDK}, which Motif's theme code needs: npx expo install expo@latest --fix.` });
      return items;
    }
  }
  for (const dir of expo) {
    const missing = hasWebSupport(dir);
    if (missing.length > 0) {
      items.push({ id: "expo-web", status: "needed", label: LABEL, detail: `The web target needs react-dom, react-native-web and @expo/metro-runtime for screenshots: ${WEB_INSTALL}` });
      return items;
    }
  }
  if (expo.length > 0) {
    const sdk = expoSdk(expo[0]!);
    items.push({ id: "expo-web", status: "ok", label: LABEL, detail: `${sdk === null ? "Expo" : `Expo SDK ${sdk}`}, with the web target's packages.` });
  }
  return items;
}
