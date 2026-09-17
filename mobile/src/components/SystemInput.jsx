/**
 * SystemInput — Text input following Apple HIG form field patterns
 * 
 * Grouped row style with separator lines, consistent with iOS Settings
 * and system form aesthetics. Includes web outline fix.
 */
import React from 'react';
import { StyleSheet, Text, TextInput, View, Platform } from 'react-native';
import { Colors, Typography, Radius, Spacing, TouchTargets } from '../theme/tokens';

export default function SystemInput({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType = 'default',
  secureTextEntry = false,
  autoCapitalize = 'sentences',
}) {
  return (
    <View style={styles.container}>
      {label && (
        <Text style={styles.label}>{label}</Text>
      )}
      <View style={styles.inputWrapper}>
        <TextInput
          style={[
            styles.input,
            Platform.OS === 'web' && { outlineStyle: 'none' },
          ]}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={Colors.tertiaryLabel}
          keyboardType={keyboardType}
          secureTextEntry={secureTextEntry}
          autoCapitalize={autoCapitalize}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: Spacing.lg,
  },
  label: {
    ...Typography.subheadline,
    color: Colors.secondaryLabel,
    marginBottom: Spacing.sm,
    paddingLeft: Spacing.xs,
  },
  inputWrapper: {
    backgroundColor: Colors.secondarySystemBackground,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.separator,
  },
  input: {
    ...Typography.body,
    color: Colors.label,
    minHeight: TouchTargets.minHeight,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
});
