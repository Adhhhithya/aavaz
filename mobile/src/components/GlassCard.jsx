/**
 * GlassCard — Reusable translucent container component
 * 
 * Uses expo-blur's BlurView with Apple's native UIVisualEffectView
 * for real system-level glass blur. Includes a solid fallback
 * backgroundColor for platforms where blur doesn't render (web).
 */
import React from 'react';
import { StyleSheet, View, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import { Radius, Glass, Shadows, Spacing, Colors } from '../theme/tokens';

export default function GlassCard({ children, style, noPadding = false }) {
  const innerStyle = [
    styles.inner,
    noPadding && { padding: 0 },
  ];

  return (
    <View style={[styles.outer, Shadows.md, style]}>
      {Platform.OS === 'ios' ? (
        <BlurView
          intensity={Glass.intensity}
          tint={Glass.tint}
          style={styles.blur}
        >
          <View style={innerStyle}>
            {children}
          </View>
        </BlurView>
      ) : (
        // Solid fallback for web and Android where blur doesn't render natively
        <View style={[styles.solidFallback, ...innerStyle]}>
          {children}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  outer: {
    borderRadius: Radius.md,
    overflow: 'hidden',
    borderWidth: Glass.borderWidth,
    borderColor: Colors.separator,
  },
  blur: {
    width: '100%',
  },
  solidFallback: {
    backgroundColor: Colors.secondarySystemBackground,
    width: '100%',
  },
  inner: {
    padding: Spacing.lg,
  },
});
