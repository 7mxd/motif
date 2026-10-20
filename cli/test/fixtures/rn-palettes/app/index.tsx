import { StyleSheet, Text, View } from 'react-native';
import Animated, { useSharedValue, withTiming } from 'react-native-reanimated';

export default function Home() {
  const x = useSharedValue(0);
  const go = () => {
    x.value = withTiming(1, { duration: 250 });
  };
  return (
    <View style={styles.box}>
      <Animated.View />
      <Text onPress={go} style={styles.title}>Hello</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { padding: 13, borderRadius: 12 },
  title: { fontSize: 22 },
});
