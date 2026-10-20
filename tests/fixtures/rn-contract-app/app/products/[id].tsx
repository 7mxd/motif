import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { AppButton } from "@/components/app-button";
import { EmptyState } from "@/components/empty-state";
import { QuantityStepper } from "@/components/quantity-stepper";
import { ScreenHeader } from "@/components/screen-header";
import { StockLabel } from "@/components/stock-label";
import { findProduct, formatPrice, local } from "@/data/catalogue";
import { radius, space, useMotifTheme } from "@/design/motif-theme";
import { strings } from "@/i18n/strings";
import { useShop } from "@/state/shop";

/** A product's page: what it is, what it costs, and how many to add. */
export default function ProductPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors, type } = useMotifTheme();
  const shop = useShop();
  const [quantity, setQuantity] = useState(1);
  const product = findProduct(id);

  if (!product) {
    return (
      <View style={[styles.screen, { backgroundColor: colors.background }]}>
        <ScreenHeader title={strings.shopName} back />
        <EmptyState icon="search-outline" title={strings.productMissing} action={{ label: strings.backToShop, onPress: () => router.replace("/") }} />
      </View>
    );
  }

  const name = local(product.name);
  const inBasket = shop.quantityOf(product.id);
  const add = () => {
    shop.add(product.id, quantity);
    router.push("/basket");
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScreenHeader title={name} back />
      <ScrollView contentContainerStyle={styles.body}>
        <View style={[styles.picture, { backgroundColor: colors.actionSecondary }]}>
          <Ionicons name={product.icon} size={64} color={colors.onActionSecondary} accessibilityElementsHidden importantForAccessibility="no" />
        </View>
        <View style={styles.facts}>
          <Text style={[type.heading, { color: colors.textPrimary }]}>{formatPrice(product.price)}</Text>
          <Text style={[type.body, { color: colors.textSecondary }]}>{local(product.pack)}</Text>
          <StockLabel stock={product.stock} />
        </View>
        <Text style={[type.body, { color: colors.textPrimary }]}>{local(product.about)}</Text>
        {product.stock === "out" ? null : (
          <View style={[styles.buy, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <QuantityStepper name={name} quantity={quantity} onChange={setQuantity} min={1} />
            <AppButton label={strings.addToBasket} onPress={add} />
            {inBasket > 0 ? <Text style={[type.caption, { color: colors.textSecondary }]}>{strings.inBasket(inBasket)}</Text> : null}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  body: { gap: space.s6, padding: space.s4, paddingBottom: space.s8 },
  picture: { alignItems: "center", borderRadius: radius.lg, height: 200, justifyContent: "center" },
  facts: { gap: space.s2 },
  buy: { borderRadius: radius.lg, borderWidth: 1, gap: space.s4, padding: space.s4 },
});
