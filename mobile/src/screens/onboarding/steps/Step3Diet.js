import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Slider from '@react-native-community/slider';
import { useOnboarding } from '../../../context/OnboardingContext';
import OptionCard from '../../../components/onboarding/OptionCard';
import { colors, fonts } from '../../../theme';

// Answer keys match utils/onboardingPayloads.js: dietType → diet_type,
// waterGlasses → water_intake, mealsPerDay → meals_per_day
const DIET_OPTIONS = [
  { key: 'balanced', title: 'Balanced', description: 'Mix of whole foods, lean protein, veg.' },
  { key: 'plant_based', title: 'Mostly plant-based', description: 'Vegetarian or vegan.' },
  { key: 'convenience', title: 'Convenience-led', description: 'Takeaways and processed food often.' },
  { key: 'irregular', title: 'Irregular', description: 'I skip meals or eat at random times.' },
];

const DEFAULT_WATER_GLASSES = 6;
const DEFAULT_MEALS_PER_DAY = 3;

// All three fields are personalisation-only (Gemini habit generation in
// Chunk 3) — they are never sent to the ML model.
export const isStep3Complete = (answers) =>
  !!answers.dietType &&
  answers.waterGlasses >= 0 && answers.waterGlasses <= 15 &&
  answers.mealsPerDay >= 1 && answers.mealsPerDay <= 6;

// Small uppercase label on the left, big accent number on the right, slider
// underneath — water and meals share this so the two fields read as one group
function NumberRow({ label, value, onValueChange, min, max }) {
  return (
    <View style={styles.numberRow}>
      <View style={styles.numberHeader}>
        <Text style={styles.numberLabel}>{label}</Text>
        <Text style={styles.numberValue}>{value}</Text>
      </View>
      <Slider
        style={styles.slider}
        minimumValue={min}
        maximumValue={max}
        step={1}
        value={value}
        onValueChange={onValueChange}
        minimumTrackTintColor={colors.accent}
        maximumTrackTintColor={colors.border}
        thumbTintColor={colors.accent}
      />
    </View>
  );
}

export default function Step3Diet() {
  const { answers, setAnswer } = useOnboarding();

  // Sliders get sensible defaults so their readouts are never blank;
  // diet type has no default — the user must actively pick a card
  useEffect(() => {
    if (answers.waterGlasses === undefined) setAnswer('waterGlasses', DEFAULT_WATER_GLASSES);
    if (answers.mealsPerDay === undefined) setAnswer('mealsPerDay', DEFAULT_MEALS_PER_DAY);
  }, []);

  return (
    <View>
      <View style={styles.cards}>
        {DIET_OPTIONS.map((option) => (
          <OptionCard
            key={option.key}
            title={option.title}
            description={option.description}
            selected={answers.dietType === option.key}
            onPress={() => setAnswer('dietType', option.key)}
          />
        ))}
      </View>

      <NumberRow
        label="WATER (GLASSES/DAY)"
        value={answers.waterGlasses ?? DEFAULT_WATER_GLASSES}
        onValueChange={(glasses) => setAnswer('waterGlasses', glasses)}
        min={0}
        max={15}
      />
      <NumberRow
        label="MEALS PER DAY"
        value={answers.mealsPerDay ?? DEFAULT_MEALS_PER_DAY}
        onValueChange={(meals) => setAnswer('mealsPerDay', meals)}
        min={1}
        max={6}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  cards: {
    gap: 12,
    marginBottom: 28,
  },
  numberRow: {
    marginBottom: 20,
  },
  numberHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  numberLabel: {
    fontFamily: fonts.semibold,
    fontSize: 12,
    letterSpacing: 1.5,
    color: colors.textMuted,
  },
  numberValue: {
    fontFamily: fonts.bold,
    fontSize: 34,
    color: colors.accent,
  },
  slider: {
    height: 40,
  },
});
