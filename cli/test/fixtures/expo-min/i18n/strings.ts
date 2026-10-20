import { I18nManager, Platform } from "react-native";

const en = {
  homeTitle: "Pantry",
  homeGreeting: "Good morning, Sara",
  homeBody: "Three items expire this week.",
  openSettings: "Settings",
  settingsTitle: "Settings",
  settingsNotifications: "Notifications",
  settingsLanguage: "Language",
  settingsLanguageValue: "English",
};

const ar: typeof en = {
  homeTitle: "المخزن",
  homeGreeting: "صباح الخير يا سارة",
  homeBody: "ثلاثة أصناف تنتهي صلاحيتها هذا الأسبوع.",
  openSettings: "الإعدادات",
  settingsTitle: "الإعدادات",
  settingsNotifications: "الإشعارات",
  settingsLanguage: "اللغة",
  settingsLanguageValue: "العربية",
};

function language(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().locale.split("-")[0]!.toLowerCase();
  } catch {
    return "en";
  }
}

export const arabic = language() === "ar";
export const strings = arabic ? ar : en;

// Right to left on the phone; the web target doesn't follow I18nManager.
if (Platform.OS !== "web" && I18nManager.isRTL !== arabic) {
  I18nManager.allowRTL(arabic);
  I18nManager.forceRTL(arabic);
}
