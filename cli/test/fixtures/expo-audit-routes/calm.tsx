import { useEffect } from "react";
import { Text, View } from "react-native";
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";

// The same loop, which stands still when the person asks for reduced motion (the app checks useReducedMotion).
export default function Calm() {
  const reduce = useReducedMotion();
  const x = useSharedValue(0);
  useEffect(() => {
    if (!reduce) x.value = withRepeat(withTiming(60, { duration: 800 }), -1, true);
  }, [x, reduce]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  return (
    <View style={{ flex: 1, backgroundColor: "#ffffff", padding: 24, paddingTop: 64, gap: 16 }}>
      <Text style={{ color: "#111111", fontSize: 24 }}>Calm</Text>
      <Animated.View style={[{ width: 40, height: 40, backgroundColor: "#0a5", borderRadius: 8 }, style]} />
    </View>
  );
}
