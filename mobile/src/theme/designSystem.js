export const DS = {
  canvas: {
    base: '#F8F9FC', // Cloud Mist
    surface: '#FFFFFF',
    surfaceSubtle: '#F4F5FA',
    card: '#FFFFFF',
    border: '#EBE8F6', // Soft Periwinkle
    borderActive: '#8A79B8', // Lavender highlight
  },
  primary: {
    main: '#8A79B8', // Lavender
    hover: '#7A68A7',
    muted: '#F0EDF8',
    glow: 'rgba(138, 121, 184, 0.25)',
  },
  accent: {
    // SOS / Danger
    sos: '#D95D5D', // Muted terracotta/coral
    sosLight: '#E06A6A',
    sosBg: 'rgba(217, 93, 93, 0.12)',
    
    // Gauge Colors
    sage: '#68B087', // Calm / Normal
    amber: '#E5A962', // Moderate / Elevated
    terracotta: '#D96B6B', // Critical / High
    
    // Status badges
    periwinkle: '#EBE8F6',
    periwinkleText: '#5F548A',
  },
  text: {
    primary: '#1E1F24', // Charcoal
    secondary: '#4A4D57',
    muted: '#636774', // Slate
    light: '#FFFFFF',
    lavender: '#8A79B8',
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 20,
    xl: 24,
    xxl: 32,
  },
  radius: {
    sm: 8,
    md: 12,
    lg: 16,
    xl: 24,
    pill: 9999,
  },
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
  },
  type: {
    hero: { fontSize: 32, fontWeight: '700', color: '#1E1F24' },
    title: { fontSize: 22, fontWeight: '700', color: '#1E1F24' },
    headline: { fontSize: 18, fontWeight: '600', color: '#1E1F24' },
    subheadline: { fontSize: 15, fontWeight: '600', color: '#1E1F24' },
    body: { fontSize: 15, fontWeight: '400', color: '#4A4D57' },
    bodyMuted: { fontSize: 13, fontWeight: '400', color: '#636774' },
    label: { fontSize: 14, fontWeight: '500', color: '#1E1F24' },
    caption: { fontSize: 12, fontWeight: '400', color: '#636774' },
  },
};
