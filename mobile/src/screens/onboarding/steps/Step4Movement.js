import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useOnboarding } from '../../../context/OnboardingContext';
import OptionCard from '../../../components/onboarding/OptionCard';
import TagSelect from '../../../components/onboarding/TagSelect';
import { colors, fonts } from '../../../theme';

// exerciseFrequency is a model feature — utils/onboardingPayloads.js maps
// these keys to _PACAT3 codes, so they must stay in sync with that map.
// exerciseTypes is personalisation-only (Gemini habit generation in Chunk 3).
const FREQUENCY_OPTIONS = [
  { key: 'rarely', title: 'Rarely', description: 'Less than once a week.' },
  { key: 'light', title: 'Light', description: '1-2 walks or sessions a week.' },
  { key: 'regular', title: 'Regular', description: '3-4 sessions a week.' },
  { key: 'intense', title: 'Intense', description: '5+ sessions, often vigorous.' },
];

const EXERCISE_TYPES = [
  { key: 'running', label: 'Running' },
  { key: 'walking', label: 'Walking' },
  { key: 'swimming', label: 'Swimming' },
  { key: 'cycling', label: 'Cycling' },
  { key: 'gym', label: 'Gym' },
  { key: 'yoga', label: 'Yoga' },
  { key: 'hiit', label: 'HIIT' },
  { key: 'sports', label: 'Sports' },
];

// Exercise types are optional — someone who rarely moves may have none
export const isStep4Complete = (answers) => !!answers.exerciseFrequency;

export default function Step4Movement() {
  const { answers, setAnswer } = useOnboarding();

  // Default to an empty array so the submission payload never sees undefined
  useEffect(() => {
    if (answers.exerciseTypes === undefined) setAnswer('exerciseTypes', []);
  }, []);

  const toggleType = (key) => {
    const current = answers.exerciseTypes ?? [];
    setAnswer(
      'exerciseTypes',
      current.includes(key) ? current.filter((k) => k !== key) : [...current, key]
    );
  };

  return (
    <View>
      <View style={styles.cards}>
        {FREQUENCY_OPTIONS.map((option) => (
          <OptionCard
            key={option.key}
            title={option.title}
            description={option.description}
            selected={answers.exerciseFrequency === option.key}
            onPress={() => setAnswer('exerciseFrequency', option.key)}
          />
        ))}
      </View>

      <Text style={styles.sectionLabel}>EXERCISE TYPES</Text>
      <TagSelect
        options={EXERCISE_TYPES}
        selected={answers.exerciseTypes ?? []}
        onToggle={toggleType}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  cards: {
    gap: 12,
    marginBottom: 28,
  },
  sectionLabel: {
    fontFamily: fonts.semibold,
    fontSize: 12,
    letterSpacing: 1.5,
    color: colors.textMuted,
    marginBottom: 14,
  },
});
