import { StyleSheet, Text, View } from "react-native";

import type { Stock } from "@/data/catalogue";
import { radius, space, useMotifTheme } from "@/design/motif-theme";
import { strings } from "@/i18n/strings";

/** Whether a product is on the shelf: a word on its status colour, never the colour alone. */
export function StockLabel({ stock }: { stock: Stock }) {
  const { colors, type } = useMotifTheme();
  const look = {
    in: { fill: "#2E7D32", ink: colors.onSuccess, text: strings.inStock },
    low: { fill: colors.warning, ink: colors.onWarning, text: strings.lowStock },
    out: { fill: colors.danger, ink: colors.onDanger, text: strings.soldOut },
  }[stock];
  return (
    <View style={[styles.label, { backgroundColor: look.fill }]}>
      <Text style={[type.caption, { color: look.ink }]}>{look.text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    alignSelf: "flex-start",
    borderRadius: radius.sm,
    paddingHorizontal: space.s2,
    paddingVertical: space.s0,
  },
});
