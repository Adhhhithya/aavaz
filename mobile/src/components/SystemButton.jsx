/**
 * SystemButton — Primary and secondary action buttons
 * 
 * Follows Apple HIG 44pt minimum touch targets, system typography,
 * and the platform's standard button patterns.
 */
import React from 'react';
import { StyleSheet, Text, Pressable, ActivityIndicator, View } from 'react-native';
import { Colors, Typography, Radius, TouchTargets, Shadows, Spacing } from '../theme/tokens';

export default function SystemButton({
  title,
  onPress,
  variant = 'filled',   // 'filled' | 'tinted' | 'plain'
  destructive = false,
  disabled = false,
  loading = false,
  style,
}) {
  const getBackgroundColor = () => {
    if (disabled) return Colors.quaternarySystemFill;
    if (variant === 'filled') return destructive ? Colors.systemRed : Colors.systemBlue;
    if (variant === 'tinted') return destructive ? 'rgba(255, 59, 48, 0.12)' : 'rgba(0, 122, 255, 0.12)';
    return 'transparent';
  };

  const getTextColor = () => {
    if (disabled) return Colors.tertiaryLabel;
    if (variant === 'filled') return '#FFFFFF';
    return destructive ? Colors.systemRed : Colors.systemBlue;
  };

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.base,
        { backgroundColor: getBackgroundColor() },
        variant === 'filled' && !disabled && Shadows.sm,
        pressed && { opacity: 0.7 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={getTextColor()} />
      ) : (
        <Text style={[
          styles.label,
          { color: getTextColor() },
        ]}>
          {title}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: TouchTargets.minHeight,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    ...Typography.headline,
  },
});
