import { Text, View } from "react-native";

import { radius, space, useMotifTheme } from "../design/motif-theme";
import { strings } from "../i18n/strings";

export default function Settings() {
  const { colors, type } = useMotifTheme();
  const row = (label: string, value?: string) => (
    <View style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: space.s3, borderBottomWidth: 1, borderColor: colors.border }}>
      <Text style={[type.body, { color: colors.textPrimary }]}>{label}</Text>
      {value ? <Text style={[type.body, { color: colors.textSecondary }]}>{value}</Text> : null}
    </View>
  );
  return (
    <View style={{ flex: 1, backgroundColor: colors.background, padding: space.s6, paddingTop: space.s16, gap: space.s4 }}>
      <Text style={[type.title, { color: colors.textPrimary }]}>{strings.settingsTitle}</Text>
      <View style={{ backgroundColor: colors.surface, borderRadius: radius.lg, paddingHorizontal: space.s5 }}>
        {row(strings.settingsNotifications)}
        {row(strings.settingsLanguage, strings.settingsLanguageValue)}
      </View>
    </View>
  );
}
