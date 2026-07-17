// AuraFit design system tokens — dark theme, #FF5A36 accent, Poppins only.
// Matches the Figma reference designs ("AuraFit — Mobile UI (Uni Project)"),
// with a deliberately lightened surface palette: cards sit on #1C1C1E charcoal
// (not near-black) with a visible border, so they separate from the background.

export const colors = {
  background: '#0A0A0B',
  // Subtle top-to-bottom gradient for screen backgrounds (charcoal → near-black)
  backgroundGradient: ['#19191C', '#0E0E10', '#060607'],
  card: '#1C1C1E',
  border: '#2C2C2E',
  accent: '#FF5A36',
  accentGlow: 'rgba(255, 90, 54, 0.28)',
  positive: '#4CD97B',
  warning: '#FFB340', // amber — mid-severity states (e.g. Moderate risk band)
  negative: '#FF5A5F',
  text: '#FFFFFF',
  textSecondary: '#B9B9BF', // labels / subtext — light grey, never pure white
  textMuted: '#999999',
  textFaint: '#666666',
  disabled: '#3A3A3A',
};

// Font family names as registered by @expo-google-fonts/poppins (loaded in App.js)
export const fonts = {
  regular: 'Poppins_400Regular',
  medium: 'Poppins_500Medium',
  semibold: 'Poppins_600SemiBold',
  bold: 'Poppins_700Bold',
};

// Shared card treatment: lighter charcoal surface + border + soft shadow for depth
export const cardStyle = {
  backgroundColor: colors.card,
  borderRadius: 18,
  borderWidth: 1,
  borderColor: colors.border,
  shadowColor: '#000',
  shadowOpacity: 0.35,
  shadowRadius: 10,
  shadowOffset: { width: 0, height: 4 },
  elevation: 4, // Android
};
