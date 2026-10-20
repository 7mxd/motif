import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import { radius, space, useMotifTheme } from "@/design/motif-theme";

type Props = {
  label: string;
  onPress: () => void;
  kind?: "primary" | "secondary";
  disabled?: boolean;
  loading?: boolean;
};

/** The shop's one button: primary for the screen's main action, secondary for the rest. */
export function AppButton({ label, onPress, kind = "primary", disabled = false, loading = false }: Props) {
  const { colors, type, reducedMotion } = useMotifTheme();
  const [focused, setFocused] = useState(false);
  const inactive = disabled || loading;
  // A spinner never stops, so with reduce motion on the label stays as it is.
  const spinner = loading && !reducedMotion;
  const fill = kind === "primary" ? colors.actionPrimary : colors.actionSecondary;
  const ink = kind === "primary" ? colors.onActionPrimary : colors.onActionSecondary;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      android_ripple={{ color: ink, foreground: true }}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: disabled ? colors.actionSecondary : fill,
          borderColor: focused ? colors.focus : disabled ? colors.actionSecondary : fill,
          opacity: pressed ? 0.88 : 1,
        },
      ]}
    >
      <Text style={[type.label, { color: disabled ? colors.textSecondary : ink }, spinner && styles.hidden]}>{label}</Text>
      {spinner ? (
        <View style={StyleSheet.absoluteFill}>
          <ActivityIndicator style={styles.spinner} color={ink} />
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: "center",
    borderRadius: radius.md,
    borderWidth: 2,
    justifyContent: "center",
    minHeight: 48,
    minWidth: 64,
    overflow: "hidden",
    paddingHorizontal: space.s6,
  },
  hidden: { opacity: 0 },
  spinner: { flex: 1 },
});
