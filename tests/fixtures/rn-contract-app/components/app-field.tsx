import { useState } from "react";
import { StyleSheet, Text, TextInput, View, type TextInputProps } from "react-native";

import { radius, space, useMotifTheme } from "@/design/motif-theme";

type Props = {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  helper?: string;
  error?: string;
  keyboardType?: TextInputProps["keyboardType"];
  autoComplete?: TextInputProps["autoComplete"];
};

/** One line of text, with its label above and its helper or error below, in words. */
export function AppField({ label, value, onChangeText, helper, error, keyboardType, autoComplete }: Props) {
  const { colors, type } = useMotifTheme();
  const [focused, setFocused] = useState(false);
  const border = error ? colors.danger : focused ? colors.focus : colors.border;

  return (
    <View style={styles.field}>
      <Text style={[type.label, { color: colors.textPrimary }]}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        accessibilityHint={error ?? helper}
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        autoComplete={autoComplete}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={[type.body, styles.input, { backgroundColor: colors.surface, borderColor: border, color: colors.textPrimary }]}
      />
      {error ? (
        <Text accessibilityLiveRegion="polite" style={[type.caption, { color: colors.danger }]}>
          {error}
        </Text>
      ) : helper ? (
        <Text style={[type.caption, { color: colors.textSecondary }]}>{helper}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: space.s1 },
  input: {
    borderRadius: radius.md,
    borderWidth: 1,
    minHeight: 48,
    paddingHorizontal: space.s4,
    paddingVertical: space.s3,
  },
});
