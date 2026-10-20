import { router } from "expo-router";
import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { IconButton } from "@/components/icon-button";
import { space, useMotifTheme } from "@/design/motif-theme";
import { strings } from "@/i18n/strings";

type Props = {
  title: string;
  /** A back button at the start, for every screen but the shop. */
  back?: boolean;
  /** Buttons at the end. */
  actions?: ReactNode;
};

/** A screen's top bar: back at the start, the title, and actions at the end, below the phone's status bar. */
export function ScreenHeader({ title, back = false, actions }: Props) {
  const { colors, type } = useMotifTheme();
  const insets = useSafeAreaInsets();
  const goBack = () => (router.canGoBack() ? router.back() : router.replace("/"));
  return (
    <View style={[styles.bar, { paddingTop: insets.top + space.s2, backgroundColor: colors.background, borderColor: colors.border }]}>
      {back ? <IconButton icon="chevron-back" label={strings.back} onPress={goBack} flipsInRtl /> : null}
      <Text accessibilityRole="header" numberOfLines={1} style={[type.title, styles.title, { color: colors.textPrimary }]}>
        {title}
      </Text>
      {actions ? <View style={styles.actions}>{actions}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    alignItems: "center",
    borderBottomWidth: 1,
    flexDirection: "row",
    paddingBottom: space.s2,
    paddingHorizontal: space.s4,
  },
  title: { flex: 1, marginLeft: space.s2 },
  actions: { flexDirection: "row", gap: space.s1 },
});
