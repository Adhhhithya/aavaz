/**
 * Design Tokens — Apple HIG Liquid Glass Design System
 * 
 * Centralized design tokens following Apple Human Interface Guidelines.
 * All screens and components MUST reference these tokens instead of
 * hardcoding values. This ensures visual consistency across the app.
 */

// ─── Color Palette ───────────────────────────────────────────────
export const Colors = {
  // System backgrounds (light mode)
  systemBackground: '#F8FAFC',
  secondarySystemBackground: '#FFFFFF',
  tertiarySystemBackground: '#F1F5F9',

  // System labels
  label: '#0F172A',
  secondaryLabel: '#475569',
  tertiaryLabel: '#94A3B8',
  quaternaryLabel: 'rgba(15, 23, 42, 0.18)',

  // System fills
  systemFill: 'rgba(59, 130, 246, 0.1)',
  secondarySystemFill: 'rgba(59, 130, 246, 0.08)',
  tertiarySystemFill: 'rgba(59, 130, 246, 0.05)',
  quaternarySystemFill: 'rgba(15, 23, 42, 0.05)',

  // Tint colors (Unified UI semantic palette)
  systemBlue: '#3B82F6', // Primary base
  systemGreen: '#10B981', // Success
  systemRed: '#EF4444', // Danger
  systemOrange: '#F59E0B', // Warning
  systemYellow: '#F59E0B', // Warning
  systemPurple: '#8A79B8', // Legacy primary
  systemTeal: '#0EA5E9', // Info

  // Separator
  separator: '#E2E8F0',
  opaqueSeparator: '#CBD5E1',

  // Glass effects
  glassBorder: 'rgba(255, 255, 255, 0.18)',
  glassBackgroundLight: 'rgba(255, 255, 255, 0.35)',
  glassShadow: '#000000',
};

// ─── Spacing ─────────────────────────────────────────────────────
export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,    // Apple inter-element gap
  lg: 16,    // Apple standard layout margin
  xl: 20,
  xxl: 24,
  xxxl: 32,
  xxxxl: 40,
};

// ─── Layout ──────────────────────────────────────────────────────
export const Layout = {
  screenPaddingHorizontal: 16,   // Apple's standard horizontal gutter
  stackGap: 12,                   // Card grouping gaps
  sectionGap: 24,                 // Between major sections
};

// ─── Border Radius ───────────────────────────────────────────────
export const Radius = {
  sm: 8,
  md: 12,    // Apple standard continuous curvature
  lg: 16,
  xl: 20,
  full: 9999,
};

// ─── Typography ──────────────────────────────────────────────────
export const Typography = {
  largeTitle: {
    fontSize: 34,
    fontWeight: '700',
    letterSpacing: 0.37,
    lineHeight: 41,
  },
  title1: {
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: 0.36,
    lineHeight: 34,
  },
  title2: {
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: 0.35,
    lineHeight: 28,
  },
  title3: {
    fontSize: 20,
    fontWeight: '600',
    letterSpacing: 0.38,
    lineHeight: 25,
  },
  headline: {
    fontSize: 17,
    fontWeight: '600',
    letterSpacing: -0.41,
    lineHeight: 22,
  },
  body: {
    fontSize: 17,
    fontWeight: '400',
    letterSpacing: -0.41,
    lineHeight: 22,
  },
  callout: {
    fontSize: 16,
    fontWeight: '400',
    letterSpacing: -0.32,
    lineHeight: 21,
  },
  subheadline: {
    fontSize: 15,
    fontWeight: '400',
    letterSpacing: -0.24,
    lineHeight: 20,
  },
  footnote: {
    fontSize: 13,
    fontWeight: '400',
    letterSpacing: -0.08,
    lineHeight: 18,
  },
  caption1: {
    fontSize: 12,
    fontWeight: '400',
    letterSpacing: 0,
    lineHeight: 16,
  },
  caption2: {
    fontSize: 11,
    fontWeight: '500',
    letterSpacing: 0.07,
    lineHeight: 13,
  },
};

// ─── Shadows ─────────────────────────────────────────────────────
export const Shadows = {
  sm: {
    shadowColor: Colors.glassShadow,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  md: {
    shadowColor: Colors.glassShadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
  },
  lg: {
    shadowColor: Colors.glassShadow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 24,
    elevation: 5,
  },
};

// ─── Touch Targets ───────────────────────────────────────────────
export const TouchTargets = {
  minHeight: 44,   // Apple strict minimum interactive target
};

// ─── Glass Configuration ─────────────────────────────────────────
export const Glass = {
  intensity: 55,          // BlurView intensity for light mode
  tint: 'light',
  borderWidth: 1,
  borderColor: Colors.glassBorder,
};
