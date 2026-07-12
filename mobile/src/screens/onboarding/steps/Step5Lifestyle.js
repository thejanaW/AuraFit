import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { useOnboarding } from '../../../context/OnboardingContext';
import SliderField from '../../../components/onboarding/SliderField';
import FormField from '../../../components/onboarding/FormField';

const DEFAULT_STRESS = 5;

// stress_level + work_hours + screen_time are personalisation-only fields
// (Gemini habit generation in Chunk 3) — they are never sent to the ML model.
export const isStep5Complete = (answers) =>
  answers.stressLevel >= 1 && answers.stressLevel <= 10 &&
  answers.workHours >= 0 && answers.workHours <= 16 &&
  answers.screenTimeHours >= 0 && answers.screenTimeHours <= 16;

function fieldError(value, min, max, message) {
  if (value === undefined || Number.isNaN(value)) return '';
  return value < min || value > max ? message : '';
}

export default function Step5Lifestyle() {
  const { answers, setAnswer } = useOnboarding();

  // The slider gets a mid-scale default so the readout is never blank;
  // the hour inputs have no default — the user must type them
  useEffect(() => {
    if (answers.stressLevel === undefined) setAnswer('stressLevel', DEFAULT_STRESS);
  }, []);

  // Numeric answers are stored as numbers; inputs edit their string form
  const numericField = (key) => ({
    value: answers[key] === undefined || Number.isNaN(answers[key]) ? '' : String(answers[key]),
    onChangeText: (text) => setAnswer(key, text === '' ? undefined : Number(text)),
  });

  return (
    <View>
      <SliderField
        value={answers.stressLevel ?? DEFAULT_STRESS}
        onValueChange={(level) => setAnswer('stressLevel', level)}
        min={1}
        max={10}
        valueLabel="AVERAGE"
        minLabel="Calm"
        maxLabel="Overwhelmed"
        style={styles.slider}
      />

      <View style={styles.row}>
        <FormField
          label="Work hours"
          unit="/day"
          placeholder="e.g. 8"
          style={styles.rowField}
          error={fieldError(answers.workHours, 0, 16, 'Enter between 0 and 16 hours.')}
          {...numericField('workHours')}
        />
        <FormField
          label="Screen time"
          unit="hours"
          placeholder="e.g. 5"
          style={styles.rowField}
          error={fieldError(answers.screenTimeHours, 0, 16, 'Enter between 0 and 16 hours.')}
          {...numericField('screenTimeHours')}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  slider: {
    marginTop: 12,
    marginBottom: 36,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  rowField: {
    flex: 1,
  },
});
