const canvasTokens = {
  base: '#F8F9FC', // Cloud Mist
  surface: '#FFFFFF',
  surfaceSubtle: '#F4F5FA',
  card: '#FFFFFF',
  border: '#EBE8F6', // Soft Periwinkle
  borderActive: '#8A79B8', // Lavender highlight
  deep: '#0F172A',
};

const primaryTokens = {
  main: '#8A79B8', // Lavender
  hover: '#7A68A7',
  muted: '#F0EDF8',
  glow: 'rgba(138, 121, 184, 0.25)',
};

const accentTokens = {
  // SOS / Danger
  sos: '#D95D5D', // Muted terracotta/coral
  sosLight: '#E06A6A',
  sosBg: 'rgba(217, 93, 93, 0.12)',

  // Gauge Colors
  sage: '#68B087', // Calm / Normal
  amber: '#E5A962', // Moderate / Elevated
  terracotta: '#D96B6B', // Critical / High

  // Extended Accents
  blue: '#3B82F6',
  crimson: '#EF4444',
  emerald: '#10B981',
  indigo: '#6366F1',
  teal: '#14B8A6',

  // Status badges
  periwinkle: '#EBE8F6',
  periwinkleText: '#5F548A',
};

const textTokens = {
  primary: '#1E1F24', // Charcoal
  secondary: '#4A4D57',
  muted: '#636774', // Slate
  light: '#FFFFFF',
  lavender: '#8A79B8',
};

const radiusTokens = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  pill: 9999,
  full: 9999,
};

const typographyTokens = {
  hero: { fontSize: 32, fontWeight: '700', color: '#1E1F24' },
  heroDisplay: { fontSize: 40, fontWeight: '800', color: '#1E1F24' },
  display: { fontSize: 26, fontWeight: '700', color: '#1E1F24' },
  title: { fontSize: 22, fontWeight: '700', color: '#1E1F24' },
  headline: { fontSize: 18, fontWeight: '600', color: '#1E1F24' },
  subheadline: { fontSize: 15, fontWeight: '600', color: '#1E1F24' },
  body: { fontSize: 15, fontWeight: '400', color: '#4A4D57' },
  bodyMuted: { fontSize: 13, fontWeight: '400', color: '#636774' },
  label: { fontSize: 14, fontWeight: '500', color: '#1E1F24' },
  caption: { fontSize: 12, fontWeight: '400', color: '#636774' },
};

export const DS = {
  canvas: canvasTokens,
  primary: primaryTokens,
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
    card: {
      shadowColor: '#1E1F24',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.04,
      shadowRadius: 12,
      elevation: 2,
    },
    hover: {
      shadowColor: '#8A79B8',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.15,
      shadowRadius: 16,
      elevation: 4,
    },
    sos: {
      shadowColor: '#D95D5D',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.25,
      shadowRadius: 10,
      elevation: 3,
    },
    ambient: {
      shadowColor: '#1E1F24',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.12,
      shadowRadius: 24,
      elevation: 8,
    },
  },
  type: typographyTokens,
  typography: typographyTokens,
  glass: {
    border: 'rgba(255, 255, 255, 0.12)',
    surface: 'rgba(255, 255, 255, 0.08)',
  },
  gradient: {
    background: ['#0F172A', '#1E293B'],
    cta: ['#8A79B8', '#6366F1'],
    danger: ['#EF4444', '#B91C1C'],
  },
  colors: {
    primary: primaryTokens,
    background: canvasTokens,
    ui: canvasTokens,
    accent: accentTokens,
    text: textTokens,
  },
};

export const glassCard = {
  backgroundColor: 'rgba(255, 255, 255, 0.08)',
  borderRadius: 16,
  borderWidth: 1,
  borderColor: 'rgba(255, 255, 255, 0.12)',
  padding: 16,
};
