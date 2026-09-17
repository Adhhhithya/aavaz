import React from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import { colors } from '../theme/colors';

export const Button = ({ title, onPress, variant = 'primary', style }) => {
  const isPrimary = variant === 'primary';
  const isAlert = variant === 'alert';

  return (
    <TouchableOpacity
      style={[
        styles.button,
        isPrimary && styles.primary,
        isAlert && styles.alert,
        style,
      ]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <Text style={[styles.text, (isPrimary || isAlert) && styles.textLight]}>
        {title}
      </Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface.light,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  primary: {
    backgroundColor: colors.primary[600],
    borderWidth: 0,
  },
  alert: {
    backgroundColor: colors.alert.sos,
    borderWidth: 0,
  },
  text: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text.primary,
  },
  textLight: {
    color: colors.text.light,
  },
});
