import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useOnboarding } from '../../../context/OnboardingContext';
import SliderField from '../../../components/onboarding/SliderField';
import YesNoToggle from '../../../components/onboarding/YesNoToggle';
import { colors, fonts } from '../../../theme';

const DEFAULT_RATING = 3;

// generalHealth (1=Poor … 5=Excellent) is a model feature — the payload
// builder inverts it to the GENHLTH code (1=Excellent … 5=Poor). The three
// diagnosis booleans are saved to health_inputs for completeness but feed
// only the dataset's target-label side, never the live /predict payload
// (see AuraFit_Full_Context.md's feature/target split).
const DIAGNOSIS_QUESTIONS = [
  { key: 'existingHeartCondition', label: 'Diagnosed with a heart condition?' },
  { key: 'highBpDiagnosis', label: 'Diagnosed with high blood pressure?' },
  { key: 'diabetesDiagnosis', label: 'Diagnosed with diabetes or pre-diabetes?' },
];

export const isStep7Complete = (answers) =>
  answers.generalHealth >= 1 && answers.generalHealth <= 5 &&
  DIAGNOSIS_QUESTIONS.every((q) => typeof answers[q.key] === 'boolean');

export default function Step7Health() {
  const { answers, setAnswer } = useOnboarding();

  // The slider gets a mid-scale default so the readout is never blank;
  // the Yes/No questions must be actively answered
  useEffect(() => {
    if (answers.generalHealth === undefined) setAnswer('generalHealth', DEFAULT_RATING);
  }, []);

  return (
    <View>
      <Text style={styles.sectionLabel}>GENERAL HEALTH</Text>
      <SliderField
        value={answers.generalHealth ?? DEFAULT_RATING}
        onValueChange={(rating) => setAnswer('generalHealth', rating)}
        min={1}
        max={5}
        valueLabel="YOUR RATING"
        minLabel="Poor"
        maxLabel="Excellent"
        style={styles.slider}
      />

      <View style={styles.toggles}>
        {DIAGNOSIS_QUESTIONS.map((question) => (
          <YesNoToggle
            key={question.key}
            label={question.label}
            value={answers[question.key]}
            onChange={(value) => setAnswer(question.key, value)}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sectionLabel: {
    fontFamily: fonts.semibold,
    fontSize: 12,
    letterSpacing: 1.5,
    color: colors.textMuted,
    marginBottom: 14,
  },
  slider: {
    marginBottom: 32,
  },
  toggles: {
    gap: 12,
  },
});
