/**
 * SegmentedControl — Apple-style segmented toggle
 * 
 * Used for role selection (victim/witness/family).
 * Follows Apple's standard segmented control dimensions and styling.
 */
import React from 'react';
import { StyleSheet, Text, View, Pressable } from 'react-native';
import { Colors, Typography, Radius, Spacing, TouchTargets } from '../theme/tokens';

export default function SegmentedControl({ options, selectedValue, onValueChange }) {
  return (
    <View style={styles.container}>
      {options.map((option) => {
        const isSelected = option.value === selectedValue;
        return (
          <Pressable
            key={option.value}
            style={[
              styles.segment,
              isSelected && styles.segmentSelected,
            ]}
            onPress={() => onValueChange(option.value)}
          >
            <Text style={[
              styles.segmentLabel,
              isSelected && styles.segmentLabelSelected,
            ]}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: Colors.tertiarySystemFill,
    borderRadius: Radius.sm,
    padding: 3,
  },
  segment: {
    flex: 1,
    minHeight: TouchTargets.minHeight - 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.sm - 3,
    paddingHorizontal: Spacing.sm,
  },
  segmentSelected: {
    backgroundColor: Colors.secondarySystemBackground,
    shadowColor: Colors.glassShadow,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.separator,
  },
  segmentLabel: {
    ...Typography.footnote,
    fontWeight: '500',
    color: Colors.secondaryLabel,
  },
  segmentLabelSelected: {
    color: Colors.label,
    fontWeight: '600',
  },
});
