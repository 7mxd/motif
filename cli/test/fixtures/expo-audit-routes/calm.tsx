import { useEffect, useRef } from "react";
import { ActivityIndicator, Animated, Text, View } from "react-native";
import { useReducedMotion } from "react-native-reanimated";

// Animated.loop that stands still when the person asks for reduced motion (the app checks it), and a loading spinner,
// which is the platform's own and isn't the app's motion.
export default function Calm() {
  const reduce = useReducedMotion();
  const x = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduce) return;
    const loop = Animated.loop(Animated.sequence([Animated.timing(x, { toValue: 60, duration: 800, useNativeDriver: false }), Animated.timing(x, { toValue: 0, duration: 800, useNativeDriver: false })]));
    loop.start();
    return () => loop.stop();
  }, [x, reduce]);
  return (
    <View style={{ flex: 1, backgroundColor: "#ffffff", padding: 24, paddingTop: 64, gap: 16 }}>
      <Text style={{ color: "#111111", fontSize: 24 }}>Calm</Text>
      <Animated.View style={{ width: 40, height: 40, backgroundColor: "#0a5", borderRadius: 8, transform: [{ translateX: x }] }} />
      <ActivityIndicator accessibilityLabel="Loading" />
    </View>
  );
}
