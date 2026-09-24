const canvasTokens = {
  base: '#F8FAFC', // Slate 50
  surface: '#FFFFFF',
  surfaceHover: '#F1F5F9', // Slate 100
  border: '#E2E8F0', // Slate 200
};

const primaryTokens = {
  main: '#3B82F6', // Blue 500
  hover: '#2563EB', // Blue 600
  muted: '#EFF6FF', // Blue 50
};

const secondaryTokens = {
  main: '#64748B', // Slate 500
  hover: '#475569', // Slate 600
  muted: '#F8FAFC', // Slate 50
};

const accentTokens = {
  success: '#10B981',
  successHover: '#059669',
  successMuted: '#ECFDF5',
  
  warning: '#F59E0B',
  warningHover: '#D97706',
  warningMuted: '#FFFBEB',
  
  danger: '#EF4444',
  dangerHover: '#DC2626',
  dangerMuted: '#FEF2F2',

  critical: '#991B1B', // Red 800
  criticalHover: '#7F1D1D',
  criticalMuted: '#FEF2F2',
  
  info: '#0EA5E9',
  infoHover: '#0284C7',
  infoMuted: '#F0F9FF',
  
  // Legacy mappings to prevent breaks
  sos: '#EF4444', 
  sage: '#10B981',
  amber: '#F59E0B',
};

const textTokens = {
  primary: '#0F172A', // Slate 900
  secondary: '#475569', // Slate 600
  muted: '#94A3B8', // Slate 400
  inverse: '#FFFFFF',
};

const radiusTokens = {
  sm: 6,
  md: 8,
  lg: 12,
  xl: 16,
  pill: 9999,
  full: 9999,
};

const typographyTokens = {
  hero: { fontSize: 32, fontWeight: '700', color: textTokens.primary },
  heroDisplay: { fontSize: 40, fontWeight: '800', color: textTokens.primary },
  display: { fontSize: 26, fontWeight: '700', color: textTokens.primary },
  title: { fontSize: 22, fontWeight: '700', color: textTokens.primary },
  headline: { fontSize: 18, fontWeight: '600', color: textTokens.primary },
  subheadline: { fontSize: 15, fontWeight: '600', color: textTokens.primary },
  body: { fontSize: 15, fontWeight: '400', color: textTokens.secondary },
  bodyMuted: { fontSize: 13, fontWeight: '400', color: textTokens.muted },
  label: { fontSize: 14, fontWeight: '500', color: textTokens.primary },
  caption: { fontSize: 12, fontWeight: '400', color: textTokens.muted },
};

export const DS = {
  canvas: canvasTokens,
  primary: primaryTokens,
  secondary: secondaryTokens,
  accent: accentTokens,
  text: textTokens,
  spacing: {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 20,
    xl: 24,
    xxl: 32,
  },
  radius: radiusTokens,
  borderRadius: radiusTokens,
  shadow: {
    sm: {
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 2,
      elevation: 1,
    },
    md: {
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.1,
      shadowRadius: 6,
      elevation: 2,
    },
    lg: {
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.1,
      shadowRadius: 15,
      elevation: 4,
    },
    critical: {
      shadowColor: '#EF4444',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 14,
      elevation: 4,
    },
    // legacy support
    card: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 2,
      elevation: 1,
    }
  },
  type: typographyTokens,
  typography: typographyTokens,
  glass: {
    border: 'rgba(255, 255, 255, 0.12)',
    surface: 'rgba(255, 255, 255, 0.08)',
  },
  colors: {
    primary: primaryTokens,
    secondary: secondaryTokens,
    background: canvasTokens,
    ui: canvasTokens,
    accent: accentTokens,
    text: textTokens,
  },
};

export const glassCard = {
  backgroundColor: 'rgba(255, 255, 255, 0.08)',
  borderRadius: 12,
  borderWidth: 1,
  borderColor: 'rgba(255, 255, 255, 0.12)',
  padding: 16,
};
