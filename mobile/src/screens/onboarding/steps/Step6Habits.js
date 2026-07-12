import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useOnboarding } from '../../../context/OnboardingContext';
import OptionCard from '../../../components/onboarding/OptionCard';
import FormField from '../../../components/onboarding/FormField';
import { estimateWeeklyDrinks } from '../../../utils/onboardingPayloads';
import { colors, fonts } from '../../../theme';

// Both answers are ML model features — utils/onboardingPayloads.js maps
// smokingStatus keys to _SMOKER3 codes (they must stay in sync with that map)
// and combines the two alcohol answers into an estimated drinksPerWeek for
// the sex-specific _RFDRHV8 heavy-drinker flag. All three alcohol values
// (frequency, per-occasion, calculated weekly) are kept in context for
// transparency/debugging.
const SMOKING_OPTIONS = [
  { key: 'never', title: 'Never smoked', description: 'Never smoked cigarettes regularly.' },
  { key: 'former', title: 'Former smoker', description: 'Used to smoke, quit.' },
  { key: 'some_days', title: 'Some days', description: 'Smoke on some days, not daily.' },
  { key: 'every_day', title: 'Every day', description: 'Smoke every day.' },
];

// Keys must stay in sync with DRINK_FREQUENCY_TO_OCCASIONS_PER_WEEK
const DRINK_FREQUENCY_OPTIONS = [
  { key: 'never', title: 'Never', description: 'I don’t drink alcohol.' },
  { key: 'monthly_or_less', title: 'Monthly or less', description: 'A few times a year, or about once a month.' },
  { key: '2_4_month', title: '2-4 times a month' },
  { key: '2_3_week', title: '2-3 times a week' },
  { key: '4_plus_week', title: '4+ times a week' },
];

export const isStep6Complete = (answers) =>
  !!answers.smokingStatus &&
  !!answers.drinkFrequency &&
  (answers.drinkFrequency === 'never' ||
    (answers.drinksPerOccasion >= 0 && answers.drinksPerOccasion <= 15));

function fieldError(value, min, max, message) {
  if (value === undefined || Number.isNaN(value)) return '';
  return value < min || value > max ? message : '';
}

export default function Step6Habits() {
  const { answers, setAnswer } = useOnboarding();

  // Recompute the weekly estimate whenever either alcohol answer changes,
  // so drinksPerWeek in context is always consistent with its inputs
  const syncWeeklyDrinks = (frequency, perOccasion) => {
    if (!frequency) return;
    if (frequency === 'never') {
      setAnswer('drinksPerWeek', 0);
    } else if (perOccasion === undefined || Number.isNaN(perOccasion)) {
      setAnswer('drinksPerWeek', undefined);
    } else {
      setAnswer('drinksPerWeek', estimateWeeklyDrinks(frequency, perOccasion));
    }
  };

  const selectFrequency = (key) => {
    setAnswer('drinkFrequency', key);
    syncWeeklyDrinks(key, answers.drinksPerOccasion);
  };

  const setDrinksPerOccasion = (text) => {
    const value = text === '' ? undefined : Number(text);
    setAnswer('drinksPerOccasion', value);
    syncWeeklyDrinks(answers.drinkFrequency, value);
  };

  const showPerOccasion = !!answers.drinkFrequency && answers.drinkFrequency !== 'never';

  return (
    <View>
      <View style={styles.cards}>
        {SMOKING_OPTIONS.map((option) => (
          <OptionCard
            key={option.key}
            title={option.title}
            description={option.description}
            selected={answers.smokingStatus === option.key}
            onPress={() => setAnswer('smokingStatus', option.key)}
          />
        ))}
      </View>

      <Text style={styles.sectionLabel}>HOW OFTEN DO YOU DRINK?</Text>
      <View style={styles.cards}>
        {DRINK_FREQUENCY_OPTIONS.map((option) => (
          <OptionCard
            key={option.key}
            title={option.title}
            description={option.description}
            selected={answers.drinkFrequency === option.key}
            onPress={() => selectFrequency(option.key)}
          />
        ))}
      </View>

      {showPerOccasion ? (
        <>
          <Text style={styles.sectionLabel}>DRINKS PER OCCASION</Text>
          <FormField
            label="Drinks on a typical day"
            placeholder="e.g. 2"
            error={fieldError(answers.drinksPerOccasion, 0, 15, 'Enter between 0 and 15 drinks.')}
            style={styles.drinksField}
            value={
              answers.drinksPerOccasion === undefined || Number.isNaN(answers.drinksPerOccasion)
                ? ''
                : String(answers.drinksPerOccasion)
            }
            onChangeText={setDrinksPerOccasion}
          />
          <Text style={styles.helperText}>How many drinks on a typical day you drink.</Text>
        </>
      ) : null}
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
  drinksField: {
    marginBottom: 8,
  },
  helperText: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.textFaint,
    lineHeight: 18,
  },
});
