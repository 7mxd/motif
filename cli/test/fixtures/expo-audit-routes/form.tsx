import { useState } from "react";
import { Text, TextInput, View } from "react-native";

export default function Form() {
  const [name, setName] = useState("");
  return (
    <View style={{ flex: 1, backgroundColor: "#ffffff", padding: 24, paddingTop: 64, gap: 16 }}>
      <Text style={{ color: "#111111", fontSize: 24 }}>Form</Text>
      <TextInput aria-label="Item name" placeholder="Item name" value={name} onChangeText={setName} style={{ height: 48, borderWidth: 1, borderColor: "#444444", paddingHorizontal: 12, color: "#111111" }} />
      <Text style={{ color: "#111111", fontSize: 18 }}>{name ? `Adding ${name}` : "Nothing yet"}</Text>
    </View>
  );
}
