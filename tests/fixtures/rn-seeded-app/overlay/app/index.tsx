import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";

import { EmptyState } from "@/components/empty-state";
import { IconButton } from "@/components/icon-button";
import { ProductRow } from "@/components/product-row";
import { ScreenHeader } from "@/components/screen-header";
import { Skeleton } from "@/components/skeleton";
import { space, useMotifTheme } from "@/design/motif-theme";
import { strings } from "@/i18n/strings";
import { useShelves, useShop } from "@/state/shop";

/** The shop: what's on the shelves today. */
export default function Catalogue() {
  const { colors, type } = useMotifTheme();
  const { products, failed, reload } = useShelves();
  const shop = useShop();

  const header = (
    <ScreenHeader
      title={strings.shopName}
      actions={
        <>
          {shop.signedIn ? null : (
            <Pressable accessibilityRole="button" onPress={() => router.push("/sign-in")} style={styles.account}>
              <Ionicons name="person-circle-outline" size={24} color={colors.textPrimary} />
            </Pressable>
          )}
          <IconButton icon="basket-outline" label={strings.basketWith(shop.count)} badge={shop.count} onPress={() => router.push("/basket")} />
        </>
      }
    />
  );

  if (failed) {
    return (
      <View style={[styles.screen, { backgroundColor: colors.background }]}>
        {header}
        <EmptyState icon="cloud-offline-outline" title={strings.loadFailed} action={{ label: strings.tryAgain, onPress: reload }} />
      </View>
    );
  }

  if (products === undefined) {
    return (
      <View style={[styles.screen, { backgroundColor: colors.background }]}>
        {header}
        <View accessibilityLabel={strings.loadingShelves} style={styles.list}>
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} height={88} />
          ))}
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      {header}
      <FlatList
        data={products}
        keyExtractor={(p) => p.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View style={styles.intro}>
            <Text style={[type.body, { color: colors.textSecondary }]}>{strings.shopIntro}</Text>
            <Text accessibilityRole="header" style={[type.heading, { color: colors.textPrimary, fontFamily: "Georgia" }]}>
              {strings.onTheShelves}
            </Text>
          </View>
        }
        renderItem={({ item }) => <ProductRow product={item} onAdd={() => shop.add(item.id)} />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  list: { gap: space.s3, padding: space.s4, paddingBottom: space.s8 },
  intro: { gap: space.s4, paddingBottom: space.s1 },
  account: { alignItems: "center", height: 44, justifyContent: "center", width: 44 },
});
