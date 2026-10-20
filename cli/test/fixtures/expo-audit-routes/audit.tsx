import { Ionicons } from "@expo/vector-icons";
import { Pressable, Text, TouchableHighlight, TouchableOpacity, View } from "react-native";

// Planted problems for the audit: copied into expo-min's app folder by rn-shot-e2e.test.ts (not part of expo-min itself,
// so its other tests keep two routes). Every button is 32 px, as an icon button drawn small often is.
const small = { width: 32, height: 32, borderRadius: 16, backgroundColor: "#444444", alignItems: "center", justifyContent: "center" } as const;

export default function Audit() {
  return (
    <View style={{ flex: 1, backgroundColor: "#ffffff", padding: 24, paddingTop: 64, gap: 16 }}>
      <Text style={{ color: "#111111", fontSize: 24 }}>Audit</Text>
      <Text style={{ color: "#c8c8c8", fontSize: 14 }}>Last restocked three days ago</Text>
      <View style={{ flexDirection: "row", gap: 16 }}>
        {/* an icon, no role, no label: the usual mistake */}
        <Pressable onPress={() => {}} style={small}>
          <Ionicons name="add" size={18} color="#ffffff" />
        </Pressable>
        {/* the same with a button role */}
        <Pressable accessibilityRole="button" onPress={() => {}} style={small}>
          <Ionicons name="add" size={18} color="#ffffff" />
        </Pressable>
        {/* named: only the size is a problem */}
        <Pressable accessibilityRole="button" accessibilityLabel="Add item" onPress={() => {}} style={small}>
          <Ionicons name="add" size={18} color="#ffffff" />
        </Pressable>
        <TouchableOpacity onPress={() => {}} style={small}>
          <Ionicons name="remove" size={18} color="#ffffff" />
        </TouchableOpacity>
        <TouchableHighlight onPress={() => {}} style={small}>
          <Ionicons name="trash" size={18} color="#ffffff" />
        </TouchableHighlight>
      </View>
      {/* text names it; a plain View with no press handler is not a control */}
      <Pressable onPress={() => {}} style={{ height: 32, alignSelf: "flex-start", paddingHorizontal: 16, justifyContent: "center", backgroundColor: "#dddddd" }}>
        <Text style={{ color: "#111111" }}>Skip</Text>
      </Pressable>
      <View style={{ width: 32, height: 32, backgroundColor: "#dddddd" }} />
    </View>
  );
}
