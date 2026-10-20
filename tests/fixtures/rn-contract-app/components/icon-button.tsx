import { Ionicons } from "@expo/vector-icons";
import { useState, type ComponentProps } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { radius, space, useMotifTheme } from "@/design/motif-theme";
import { rtl } from "@/i18n/strings";

type Props = {
  icon: ComponentProps<typeof Ionicons>["name"];
  /** What a screen reader says: the action, not the icon ("Add oat milk to basket"). */
  label: string;
  onPress: () => void;
  /** A count shown on the icon, such as the basket's; it is part of the label too. */
  badge?: number;
  /** Icons that point a way (back) turn round in Arabic. */
  flipsInRtl?: boolean;
  disabled?: boolean;
};

export function IconButton({ icon, label, onPress, badge, flipsInRtl = false, disabled = false }: Props) {
  const { colors, type } = useMotifTheme();
  const [focused, setFocused] = useState(false);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      hitSlop={space.s1}
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      android_ripple={{ color: colors.border, borderless: true }}
      style={({ pressed }) => [styles.button, { borderColor: focused ? colors.focus : "transparent", opacity: disabled ? 0.4 : pressed ? 0.7 : 1 }]}
    >
      <Ionicons name={icon} size={24} color={colors.textPrimary} style={flipsInRtl && rtl ? styles.flipped : undefined} />
      {badge ? (
        <View style={[styles.badge, { backgroundColor: colors.actionPrimary }]}>
          <Text style={[type.caption, { color: colors.onActionPrimary }]}>{badge}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: "center",
    borderRadius: radius.full,
    borderWidth: 2,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  flipped: { transform: [{ scaleX: -1 }] },
  badge: {
    alignItems: "center",
    borderRadius: radius.full,
    end: 0,
    minWidth: 20,
    paddingHorizontal: space.s1,
    position: "absolute",
    top: 0,
  },
});
