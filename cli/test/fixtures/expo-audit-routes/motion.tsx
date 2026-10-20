import { useEffect } from "react";
import { Text, View } from "react-native";
import Animated, {
  ReduceMotion, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";

// A loop that ignores the phone's reduced-motion setting: Reanimated would stop it by itself (its default is
// ReduceMotion.System), so this one says Never.
export default function Motion() {
  const x = useSharedValue(0);
  useEffect(() => {
    x.value = withRepeat(withTiming(60, { duration: 800, reduceMotion: ReduceMotion.Never }), -1, true, undefined, ReduceMotion.Never);
  }, [x]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  return (
    <View style={{ flex: 1, backgroundColor: "#ffffff", padding: 24, paddingTop: 64, gap: 16 }}>
      <Text style={{ color: "#111111", fontSize: 24 }}>Motion</Text>
      <Animated.View style={[{ width: 40, height: 40, backgroundColor: "#0a5", borderRadius: 8 }, style]} />
    </View>
  );
}
