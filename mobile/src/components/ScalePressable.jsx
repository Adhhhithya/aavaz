import React from 'react';
import { Pressable, StyleSheet } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

// Animated.createAnimatedComponent wraps Pressable to allow Reanimated styles
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export default function ScalePressable({
  children,
  onPress,
  onLongPress,
  style,
  scaleTo = 0.95,
  disabled = false,
  haptic = true, // By default provide haptics
  ...props
}) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ scale: scale.value }],
    };
  });

  const handlePressIn = (e) => {
    if (!disabled) {
      if (haptic) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
      scale.value = withSpring(scaleTo, {
        stiffness: 400,
        damping: 20,
        mass: 0.5,
      });
    }
    props.onPressIn?.(e);
  };

  const handlePressOut = (e) => {
    if (!disabled) {
      scale.value = withSpring(1, {
        stiffness: 400,
        damping: 20,
        mass: 0.5,
      });
    }
    props.onPressOut?.(e);
  };

  return (
    <AnimatedPressable
      onPress={onPress}
      onLongPress={onLongPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={disabled}
      style={[style, animatedStyle]}
      {...props}
    >
      {children}
    </AnimatedPressable>
  );
}
