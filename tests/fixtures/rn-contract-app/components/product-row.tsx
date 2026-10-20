import { Ionicons } from "@expo/vector-icons";
import { Link } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { IconButton } from "@/components/icon-button";
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
            <Text numberOfLines={2} style={[type.body, { color: colors.textPrimary }]}>
              {name}
            </Text>
            <Text style={[type.caption, { color: colors.textSecondary }]}>{local(product.pack)}</Text>
            <View style={styles.meta}>
              <Text style={[type.label, { color: colors.textPrimary }]}>{formatPrice(product.price)}</Text>
              <StockLabel stock={product.stock} />
            </View>
          </View>
        </Pressable>
      </Link>
      <IconButton icon="add-circle-outline" label={strings.addNamed(name)} onPress={onAdd} disabled={product.stock === "out"} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: "center",
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: "row",
    gap: space.s2,
    paddingEnd: space.s2,
  },
  open: { alignItems: "center", flex: 1, flexDirection: "row", gap: space.s3, padding: space.s3 },
  tile: { alignItems: "center", borderRadius: radius.md, height: 56, justifyContent: "center", width: 56 },
  text: { flex: 1, gap: space.s1 },
  meta: { alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: space.s2 },
});
