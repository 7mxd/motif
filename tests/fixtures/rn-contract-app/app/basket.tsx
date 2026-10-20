import { router } from "expo-router";
import { useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";

import { AppButton } from "@/components/app-button";
import { EmptyState } from "@/components/empty-state";
import { QuantityStepper } from "@/components/quantity-stepper";
import { ScreenHeader } from "@/components/screen-header";
import { formatPrice, local } from "@/data/catalogue";
import { radius, space, useMotifTheme } from "@/design/motif-theme";
import { strings } from "@/i18n/strings";
import { useShop } from "@/state/shop";

/** The basket: each line with its quantity, the total, and the order button. */
export default function Basket() {
  const { colors, type } = useMotifTheme();
  const shop = useShop();
  const [placed, setPlaced] = useState(false);

  const order = () => {
    if (!shop.signedIn) {
      router.push("/sign-in");
      return;
    }
    shop.clear();
    setPlaced(true);
  };

  if (placed) {
    return (
      <View style={[styles.screen, { backgroundColor: colors.background }]}>
        <ScreenHeader title={strings.basket} back />
        <EmptyState icon="checkmark-circle-outline" title={strings.orderPlaced} action={{ label: strings.backToShop, onPress: () => router.replace("/") }} />
      </View>
    );
  }

  if (shop.lines.length === 0) {
    return (
      <View style={[styles.screen, { backgroundColor: colors.background }]}>
        <ScreenHeader title={strings.basket} back />
        <EmptyState icon="basket-outline" title={strings.basketEmpty} hint={strings.basketEmptyHint} action={{ label: strings.browseShop, onPress: () => router.replace("/") }} />
      </View>
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScreenHeader title={strings.basket} back />
      <FlatList
        data={shop.lines}
        keyExtractor={(line) => line.product.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => {
          const name = local(item.product.name);
          return (
            <View style={[styles.line, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.lineText}>
                <Text style={[type.body, { color: colors.textPrimary }]}>{name}</Text>
                <Text style={[type.caption, { color: colors.textSecondary }]}>{local(item.product.pack)}</Text>
              </View>
              <View style={styles.lineEnd}>
                <Text style={[type.label, { color: colors.textPrimary }]}>{formatPrice(item.product.price * item.quantity)}</Text>
                <QuantityStepper name={name} quantity={item.quantity} onChange={(q) => shop.setQuantity(item.product.id, q)} />
              </View>
            </View>
          );
        }}
      />
      <View style={[styles.footer, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.total}>
          <Text style={[type.label, { color: colors.textSecondary }]}>{strings.total}</Text>
          <Text style={[type.heading, { color: colors.textPrimary }]}>{formatPrice(shop.total)}</Text>
        </View>
        <AppButton label={shop.signedIn ? strings.placeOrder : strings.signInToOrder} onPress={order} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  list: { gap: space.s3, padding: space.s4 },
  line: { borderRadius: radius.lg, borderWidth: 1, gap: space.s3, padding: space.s4 },
  lineText: { gap: space.s1 },
  lineEnd: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  footer: { borderTopWidth: 1, gap: space.s3, padding: space.s4, paddingBottom: space.s6 },
  total: { alignItems: "baseline", flexDirection: "row", justifyContent: "space-between" },
});
