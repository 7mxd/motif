import { useEffect, useRef } from "react";
import { Animated, Text, View } from "react-native";

// React Native's own Animated, looping, with no check for reduced motion: the common case.
export default function Loop() {
  const x = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([Animated.timing(x, { toValue: 60, duration: 800, useNativeDriver: false }), Animated.timing(x, { toValue: 0, duration: 800, useNativeDriver: false })]));
    loop.start();
    return () => loop.stop();
  }, [x]);
  return (
    <View style={{ flex: 1, backgroundColor: "#ffffff", padding: 24, paddingTop: 64, gap: 16 }}>
      <Text style={{ color: "#111111", fontSize: 24 }}>Loop</Text>
      <Animated.View style={{ width: 40, height: 40, backgroundColor: "#0a5", borderRadius: 8, transform: [{ translateX: x }] }} />
    </View>
  );
}
