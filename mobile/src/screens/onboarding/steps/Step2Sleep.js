import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useOnboarding } from '../../../context/OnboardingContext';
import SliderField from '../../../components/onboarding/SliderField';
import NumberScale from '../../../components/onboarding/NumberScale';
import { colors, fonts } from '../../../theme';

const DEFAULT_SLEEP_HOURS = 7;

// sleep_hours + sleep_quality are personalisation-only fields (Gemini habit
// generation in Chunk 3) — they are never sent to the ML model.
export const isStep2Complete = (answers) =>
  answers.sleepHours >= 3 && answers.sleepHours <= 12 &&
  answers.sleepQuality >= 1 && answers.sleepQuality <= 5;

export default function Step2Sleep() {
  const { answers, setAnswer } = useOnboarding();

  // Give the slider a sensible starting value so the readout is never blank;
  // quality has no default — the user must actively pick it
  useEffect(() => {
    if (answers.sleepHours === undefined) setAnswer('sleepHours', DEFAULT_SLEEP_HOURS);
  }, []);

  return (
    <View>
      <SliderField
        value={answers.sleepHours ?? DEFAULT_SLEEP_HOURS}
        onValueChange={(hours) => setAnswer('sleepHours', hours)}
        min={3}
        max={12}
        valueLabel="HOURS PER NIGHT"
        minLabel="3h"
        maxLabel="12h"
        style={styles.slider}
      />

      <Text style={styles.sectionLabel}>SLEEP QUALITY</Text>
      <NumberScale
        value={answers.sleepQuality}
        onChange={(quality) => setAnswer('sleepQuality', quality)}
        min={1}
        max={5}
        leftLabel="Restless"
        rightLabel="Deep"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  slider: {
    marginTop: 12,
    marginBottom: 36,
  },
  sectionLabel: {
    fontFamily: fonts.semibold,
    fontSize: 12,
    letterSpacing: 1.5,
    color: colors.textMuted,
    marginBottom: 14,
  },
});
