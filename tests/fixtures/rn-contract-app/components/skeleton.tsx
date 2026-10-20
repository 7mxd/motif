import { useEffect } from "react";
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";

import { duration, easing, radius, useMotifTheme } from "@/design/motif-theme";

/** A loading placeholder in the final layout's shape. It pulses, and stands still when reduce motion is on. */
export function Skeleton({ height, width }: { height: number; width?: number }) {
  const { colors, reducedMotion } = useMotifTheme();
  const opacity = useSharedValue(1);

  useEffect(() => {
    if (reducedMotion) {
      cancelAnimation(opacity);
      opacity.value = 1;
      return;
    }
    opacity.value = withRepeat(withTiming(0.5, { duration: duration.slow, easing: easing.standard }), -1, true);
    return () => cancelAnimation(opacity);
  }, [reducedMotion, opacity]);

  const pulse = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return <Animated.View accessibilityElementsHidden style={[{ backgroundColor: colors.border, borderRadius: radius.md, height, width }, pulse]} />;
}
