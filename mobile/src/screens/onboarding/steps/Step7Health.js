import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useOnboarding } from '../../../context/OnboardingContext';
import SliderField from '../../../components/onboarding/SliderField';
import YesNoToggle from '../../../components/onboarding/YesNoToggle';
import { colors, fonts } from '../../../theme';

// generalHealth (1=Poor … 5=Excellent) is a model feature — the payload
// builder inverts it to the GENHLTH code (1=Excellent … 5=Poor). The three
// diagnosis booleans are saved to health_inputs for completeness but feed
// only the dataset's target-label side, never the live /predict payload
// (see AuraFit_Full_Context.md's feature/target split).
//
// The slider deliberately has NO default: generalHealth is the single
// heaviest model feature, and a pre-filled "Good" once let an untouched
// slider silently submit an inaccurate answer (all-unhealthy profile scored
// 84 instead of ~11). It stays unanswered — greyed out, dash readout — until
// the user touches it, and Finish stays disabled until then, exactly like
// the Yes/No toggles.
// Concrete anchor descriptions per rating (UX accuracy note for the
// dissertation): a bare 1-5 number with vague endpoints made cautious users
// under-rate genuinely good health ("4 just in case"), and since
// generalHealth is the heaviest model feature that caution visibly skewed
// scores. The names mirror the BRFSS GENHLTH category labels; the
// descriptions give each number a concrete, self-checkable meaning. Display
// only — the stored 1-5 value and ratingToGenHlth mapping are unchanged.
const RATING_DESCRIPTIONS = {
  1: { name: 'Poor', description: 'Ongoing health problems that affect my daily life' },
  2: { name: 'Fair', description: "Some health concerns I'm managing" },
  3: { name: 'Good', description: 'Generally fine, occasional minor issues' },
  4: { name: 'Very Good', description: 'No significant issues, feel well most of the time' },
  5: { name: 'Excellent', description: 'No known health concerns, feel great regularly' },
};

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
  const rating = RATING_DESCRIPTIONS[answers.generalHealth];

  return (
    <View>
      <Text style={styles.sectionLabel}>GENERAL HEALTH</Text>
      <SliderField
        value={answers.generalHealth}
        onValueChange={(value) => setAnswer('generalHealth', value)}
        min={1}
        max={5}
        valueLabel="YOUR RATING"
        minLabel="Poor"
        maxLabel="Excellent"
        style={styles.slider}
      />
      {/* minHeight keeps the toggles from shifting as the text changes */}
      <View style={styles.ratingHint}>
        {rating ? (
          <>
            <Text style={styles.ratingName}>{rating.name}</Text>
            <Text style={styles.ratingDescription}>{rating.description}</Text>
          </>
        ) : (
          <Text style={styles.ratingDescription}>
            Slide to rate — what each rating means appears here
          </Text>
        )}
      </View>

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
    marginBottom: 14,
  },
  ratingHint: {
    minHeight: 58,
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 24,
  },
  ratingName: {
    fontFamily: fonts.semibold,
    fontSize: 15,
    color: colors.text,
    marginBottom: 3,
  },
  ratingDescription: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
  },
  toggles: {
    gap: 12,
  },
});
