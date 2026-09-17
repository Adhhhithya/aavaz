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
  systemBackground: '#F2F2F7',
  secondarySystemBackground: '#FFFFFF',
  tertiarySystemBackground: '#F2F2F7',

  // System labels
  label: '#000000',
  secondaryLabel: 'rgba(60, 60, 67, 0.6)',
  tertiaryLabel: 'rgba(60, 60, 67, 0.3)',
  quaternaryLabel: 'rgba(60, 60, 67, 0.18)',

  // System fills
  systemFill: 'rgba(120, 120, 128, 0.2)',
  secondarySystemFill: 'rgba(120, 120, 128, 0.16)',
  tertiarySystemFill: 'rgba(118, 118, 128, 0.12)',
  quaternarySystemFill: 'rgba(116, 116, 128, 0.08)',

  // Tint colors (Apple system palette)
  systemBlue: '#007AFF',
  systemGreen: '#34C759',
  systemRed: '#FF3B30',
  systemOrange: '#FF9500',
  systemYellow: '#FFCC00',
  systemPurple: '#AF52DE',
  systemTeal: '#5AC8FA',

  // Separator
  separator: 'rgba(60, 60, 67, 0.12)',
  opaqueSeparator: '#C6C6C8',

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
