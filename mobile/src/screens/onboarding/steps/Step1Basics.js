import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useOnboarding } from '../../../context/OnboardingContext';
import FormField from '../../../components/onboarding/FormField';
import OptionPill from '../../../components/onboarding/OptionPill';
import { colors, fonts } from '../../../theme';

const GENDER_OPTIONS = [
  { key: 'female', label: 'Female' },
  { key: 'male', label: 'Male' },
];

// Validation ranges: the ML model is trained on adults (BRFSS 18+);
// height/weight bounds keep the derived BMI inside the service's 10-100 range
export const isStep1Complete = (answers) =>
  answers.age >= 18 && answers.age <= 100 &&
  answers.heightCm >= 100 && answers.heightCm <= 250 &&
  answers.weightKg >= 30 && answers.weightKg <= 300 &&
  !!answers.gender;

function fieldError(value, min, max, message) {
  if (value === undefined || Number.isNaN(value)) return '';
  return value < min || value > max ? message : '';
}

export default function Step1Basics() {
  const { answers, setAnswer } = useOnboarding();

  // Numeric answers are stored as numbers; inputs edit their string form
  const numericField = (key) => ({
    value: answers[key] === undefined || Number.isNaN(answers[key]) ? '' : String(answers[key]),
    onChangeText: (text) => setAnswer(key, text === '' ? undefined : Number(text)),
  });

  return (
    <View>
      <FormField
        label="Age"
        unit="years"
        placeholder="e.g. 24"
        error={fieldError(answers.age, 18, 100, 'AuraFit’s risk model is designed for adults aged 18–100.')}
        {...numericField('age')}
      />

      <View style={styles.row}>
        <FormField
          label="Height"
          unit="cm"
          placeholder="e.g. 175"
          style={styles.rowField}
          error={fieldError(answers.heightCm, 100, 250, 'Enter a height between 100 and 250 cm.')}
          {...numericField('heightCm')}
        />
        <FormField
          label="Weight"
          unit="kg"
          placeholder="e.g. 70"
          style={styles.rowField}
          error={fieldError(answers.weightKg, 30, 300, 'Enter a weight between 30 and 300 kg.')}
          {...numericField('weightKg')}
        />
      </View>

      <Text style={styles.groupLabel}>Gender</Text>
      <View style={styles.pillRow}>
        {GENDER_OPTIONS.map((option) => (
          <OptionPill
            key={option.key}
            label={option.label}
            selected={answers.gender === option.key}
            onPress={() => setAnswer('gender', option.key)}
            style={styles.pill}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  rowField: {
    flex: 1,
  },
  groupLabel: {
    fontFamily: fonts.medium,
    fontSize: 14,
    color: colors.text,
    marginBottom: 8,
  },
  pillRow: {
    flexDirection: 'row',
    gap: 10,
  },
  pill: {
    flex: 1,
  },
});
