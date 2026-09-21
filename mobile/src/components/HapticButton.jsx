import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import ScalePressable from './ScalePressable';
import { DS } from '../theme/designSystem';

export default function HapticButton({
  title,
  onPress,
  variant = 'primary', // 'primary' | 'secondary' | 'danger'
  style,
  textStyle,
  icon,
  hapticStyle = Haptics.ImpactFeedbackStyle.Light,
  disabled = false,
  ...props
}) {
  const handlePress = (e) => {
    if (!disabled) {
      if (hapticStyle) {
        Haptics.impactAsync(hapticStyle);
      }
      onPress?.(e);
    }
  };

  const getContainerStyle = () => {
    if (disabled) return styles.disabledContainer;
    switch (variant) {
      case 'primary': return styles.primaryContainer;
      case 'secondary': return styles.secondaryContainer;
      case 'danger': return styles.dangerContainer;
      default: return styles.primaryContainer;
    }
  };

  const getTextStyle = () => {
    if (disabled) return styles.disabledText;
    switch (variant) {
      case 'primary': return styles.primaryText;
      case 'secondary': return styles.secondaryText;
      case 'danger': return styles.dangerText;
      default: return styles.primaryText;
    }
  };

  return (
    <ScalePressable
      onPress={handlePress}
      disabled={disabled}
      style={[styles.button, getContainerStyle(), style]}
      {...props}
    >
      <View style={styles.content}>
        {icon && <View style={styles.iconContainer}>{icon}</View>}
        <Text style={[styles.text, getTextStyle(), textStyle]}>{title}</Text>
      </View>
    </ScalePressable>
  );
}

const styles = StyleSheet.create({
  button: {
    paddingVertical: DS.spacing.md,
    paddingHorizontal: DS.spacing.xl,
    borderRadius: DS.borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconContainer: {
    marginRight: DS.spacing.sm,
  },
  text: {
    ...DS.typography.body,
    fontWeight: 'bold',
  },
  primaryContainer: {
    backgroundColor: DS.colors.primary.main,
    borderWidth: 1,
    borderColor: DS.colors.primary.main,
  },
  primaryText: {
    color: '#ffffff',
  },
  secondaryContainer: {
    backgroundColor: DS.colors.background.surface,
    borderWidth: 1,
    borderColor: DS.colors.ui.border,
  },
  secondaryText: {
    color: DS.colors.text.primary,
  },
  dangerContainer: {
    backgroundColor: DS.colors.accent.sos,
  },
  dangerText: {
    color: '#ffffff',
  },
  disabledContainer: {
    backgroundColor: DS.colors.background.surfaceSubtle,
    borderWidth: 1,
    borderColor: DS.colors.ui.border,
    opacity: 0.6,
  },
  disabledText: {
    color: DS.colors.text.muted,
  },
});
