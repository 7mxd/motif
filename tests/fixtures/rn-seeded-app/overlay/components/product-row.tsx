import { Ionicons } from "@expo/vector-icons";
import { Link } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { StockLabel } from "@/components/stock-label";
import { formatPrice, local, type Product } from "@/data/catalogue";
import { radius, space, useMotifTheme } from "@/design/motif-theme";
import { strings } from "@/i18n/strings";

type Props = { product: Product; onAdd: () => void };

/** A product on the shelves: the row opens its page, and the button beside it adds one to the basket. */
export function ProductRow({ product, onAdd }: Props) {
  const { colors, type } = useMotifTheme();
  const [focused, setFocused] = useState(false);
  // Link takes a flat style for its child, not a callback, so the pressed look is kept in state.
  const [pressed, setPressed] = useState(false);
  const name = local(product.name);
  return (
    <View style={[styles.row, { backgroundColor: colors.surface, borderColor: focused ? colors.focus : colors.border }]}>
      <Link href={`/products/${product.id}`} asChild>
        <Pressable
          accessibilityLabel={`${name}, ${formatPrice(product.price)}`}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onPressIn={() => setPressed(true)}
          onPressOut={() => setPressed(false)}
          style={StyleSheet.flatten([styles.open, { opacity: pressed ? 0.7 : 1 }])}
        >
          <View style={[styles.tile, { backgroundColor: colors.actionSecondary }]}>
            <Ionicons name={product.icon} size={24} color={colors.onActionSecondary} accessibilityElementsHidden importantForAccessibility="no" />
          </View>
          <View style={styles.text}>
            <Text numberOfLines={1} style={[type.body, { color: colors.textPrimary }]}>
              {name}
            </Text>
            <View style={styles.meta}>
              <Text style={[type.label, { color: colors.textPrimary }]}>{formatPrice(product.price)}</Text>
              <StockLabel stock={product.stock} />
            </View>
          </View>
        </Pressable>
      </Link>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={strings.addNamed(name)}
        disabled={product.stock === "out"}
        onPress={onAdd}
        style={styles.add}
      >
        <Ionicons name="add-circle-outline" size={20} color={colors.textPrimary} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: "center",
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: "row",
    gap: space.s1,
    paddingEnd: space.s1,
  },
  open: { alignItems: "center", flex: 1, flexDirection: "row", gap: space.s1, padding: space.s1 },
  tile: { alignItems: "center", borderRadius: radius.md, height: 40, justifyContent: "center", width: 40 },
  text: { flex: 1, gap: space.s0 },
  meta: { alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: space.s2 },
  add: { alignItems: "center", height: 32, justifyContent: "center", width: 32 },
});
