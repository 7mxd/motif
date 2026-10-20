import { Pressable, Text, View } from "react-native";

// Planted problems for the audit: copied into expo-min's app folder by rn-shot-e2e.test.ts (not part of expo-min itself,
// so its other tests keep two routes).
export default function Audit() {
  return (
    <View style={{ flex: 1, backgroundColor: "#ffffff", padding: 24, paddingTop: 64, gap: 16 }}>
      <Text style={{ color: "#111111", fontSize: 24 }}>Audit</Text>
      <Text style={{ color: "#c8c8c8", fontSize: 14 }}>Last restocked three days ago</Text>
      {/* 32 px, tappable, no name, no role */}
      <Pressable onPress={() => {}} style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: "#444444" }} />
      {/* 32 px, a button role, still no name */}
      <Pressable accessibilityRole="button" onPress={() => {}} style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: "#444444" }} />
      {/* 32 px but named: only the size is a problem */}
      <Pressable accessibilityRole="button" accessibilityLabel="Add item" onPress={() => {}} style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: "#444444" }} />
    </View>
  );
}
