import { Ionicons } from "@expo/vector-icons";
import type { ComponentProps } from "react";
import { StyleSheet, Text, View } from "react-native";

import { AppButton } from "@/components/app-button";
import { space, useMotifTheme } from "@/design/motif-theme";

type Props = {
  icon: ComponentProps<typeof Ionicons>["name"];
  title: string;
  hint?: string;
  action: { label: string; onPress: () => void };
};

/** Nothing here yet (or something went wrong): an icon, a line of why, and one way on. */
export function EmptyState({ icon, title, hint, action }: Props) {
  const { colors, type } = useMotifTheme();
  return (
    <View style={styles.empty}>
      <Ionicons name={icon} size={48} color={colors.textSecondary} accessibilityElementsHidden importantForAccessibility="no" />
      <Text style={[type.heading, styles.centred, { color: colors.textPrimary }]}>{title}</Text>
      {hint ? <Text style={[type.body, styles.centred, { color: colors.textSecondary }]}>{hint}</Text> : null}
      <AppButton label={action.label} onPress={action.onPress} kind="secondary" />
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { alignItems: "center", flex: 1, gap: space.s4, justifyContent: "center", padding: space.s8 },
  centred: { textAlign: "center" },
});
