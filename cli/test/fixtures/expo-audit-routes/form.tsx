import { useState } from "react";
import { Text, TextInput, View } from "react-native";

export default function Form() {
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("");
  const field = { height: 48, borderWidth: 1, borderColor: "#444444", paddingHorizontal: 12, color: "#111111" } as const;
  return (
    <View style={{ flex: 1, backgroundColor: "#ffffff", padding: 24, paddingTop: 64, gap: 16 }}>
      <Text style={{ color: "#111111", fontSize: 24 }}>Form</Text>
      <TextInput aria-label="Item name" placeholder="Item name" value={name} onChangeText={setName} style={field} />
      {/* found by its placeholder alone */}
      <TextInput placeholder="Quantity" value={quantity} onChangeText={setQuantity} style={field} />
      <Text style={{ color: "#111111", fontSize: 18 }}>{name ? `Adding ${quantity} ${name}` : "Nothing yet"}</Text>
    </View>
  );
}
