import { Link } from "expo-router";
import { Text, View } from "react-native";

import { radius, space, useMotifTheme } from "../design/motif-theme";
import { strings } from "../i18n/strings";

export default function Home() {
  const { colors, type } = useMotifTheme();
  return (
    <View style={{ flex: 1, backgroundColor: colors.background, padding: space.s6, paddingTop: space.s16, gap: space.s4 }}>
      <Text style={[type.title, { color: colors.textPrimary }]}>{strings.homeTitle}</Text>
      <View style={{ backgroundColor: colors.surface, borderRadius: radius.lg, padding: space.s5, gap: space.s2, borderWidth: 1, borderColor: colors.border }}>
        <Text style={[type.heading, { color: colors.textPrimary }]}>{strings.homeGreeting}</Text>
        <Text style={[type.body, { color: colors.textSecondary }]}>{strings.homeBody}</Text>
      </View>
      <Link href="/settings" style={[type.label, { alignSelf: "flex-start", backgroundColor: colors.actionPrimary, color: colors.onActionPrimary, borderRadius: radius.md, paddingVertical: space.s3, paddingHorizontal: space.s5 }]}>
        {strings.openSettings}
      </Link>
    </View>
  );
}
