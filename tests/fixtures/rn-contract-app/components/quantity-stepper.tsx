import { StyleSheet, Text, View } from "react-native";

import { IconButton } from "@/components/icon-button";
import { radius, space, useMotifTheme } from "@/design/motif-theme";
import { strings } from "@/i18n/strings";

type Props = {
  /** The product's name, for the buttons' labels ("One more oat milk"). */
  name: string;
  quantity: number;
  onChange: (quantity: number) => void;
  /** The smallest it goes: 1 on a product's page, 0 (which removes the line) in the basket. */
  min?: number;
};

export function QuantityStepper({ name, quantity, onChange, min = 0 }: Props) {
  const { colors, type } = useMotifTheme();
  return (
    <View style={[styles.stepper, { backgroundColor: colors.actionSecondary }]}>
      <IconButton icon="remove" label={strings.fewer(name)} onPress={() => onChange(quantity - 1)} disabled={quantity <= min} />
      <Text style={[type.label, styles.count, { color: colors.onActionSecondary }]}>{quantity}</Text>
      <IconButton icon="add" label={strings.more(name)} onPress={() => onChange(quantity + 1)} />
    </View>
  );
}

const styles = StyleSheet.create({
  stepper: { alignItems: "center", alignSelf: "flex-start", borderRadius: radius.full, flexDirection: "row", gap: space.s1 },
  count: { minWidth: 24, textAlign: "center" },
});
