import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { OnboardingProvider, useOnboarding, TOTAL_STEPS } from '../../context/OnboardingContext';
import StepScreen from '../../components/onboarding/StepScreen';
import Step1Basics, { isStep1Complete } from './steps/Step1Basics';
import Step2Sleep, { isStep2Complete } from './steps/Step2Sleep';
import Step3Diet, { isStep3Complete } from './steps/Step3Diet';
import Step4Movement, { isStep4Complete } from './steps/Step4Movement';
import Step5Lifestyle, { isStep5Complete } from './steps/Step5Lifestyle';
import Step6Habits, { isStep6Complete } from './steps/Step6Habits';
import Step7Health, { isStep7Complete } from './steps/Step7Health';
import { buildModelPayload, buildHealthInputsPayload } from '../../utils/onboardingPayloads';
import { api } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { localMonth } from '../../utils/date';
import { colors, fonts } from '../../theme';

// Step registry — one entry per onboarding step, in order. To add a step:
// build its component in ./steps/, then fill in `component` and `isComplete`.
// Entries with component: null render a placeholder so the flow stays
// click-through-able while steps 2-7 are being built.
const STEPS = [
  {
    label: 'BASICS',
    icon: 'person-outline',
    title: 'Tell us about you',
    subtitle: 'These basics anchor your health risk profile.',
    component: Step1Basics,
    isComplete: isStep1Complete,
  },
  {
    label: 'SLEEP',
    icon: 'moon-outline',
    title: 'How do you sleep?',
    subtitle: 'Sleep drives nearly every other risk factor.',
    component: Step2Sleep,
    isComplete: isStep2Complete,
  },
  {
    label: 'DIET',
    icon: 'restaurant-outline',
    title: 'How do you eat?',
    subtitle: 'Your eating pattern shapes your daily habit plan.',
    component: Step3Diet,
    isComplete: isStep3Complete,
  },
  {
    label: 'MOVEMENT',
    icon: 'barbell-outline',
    title: 'How often do you move?',
    subtitle: 'Be honest — that’s where insight comes from.',
    component: Step4Movement,
    isComplete: isStep4Complete,
  },
  {
    label: 'LIFESTYLE',
    icon: 'pulse-outline',
    title: 'How stressed do you feel, day to day?',
    subtitle: null,
    component: Step5Lifestyle,
    isComplete: isStep5Complete,
  },
  {
    label: 'HABITS',
    icon: 'wine-outline',
    title: 'Your habits, honestly.',
    subtitle: 'No judgment — just data that makes your risk score accurate.',
    component: Step6Habits,
    isComplete: isStep6Complete,
  },
  {
    label: 'HEALTH BACKGROUND',
    icon: 'heart-outline',
    title: 'Any existing conditions?',
    subtitle: 'This helps us calibrate your risk profile, not diagnose you.',
    component: Step7Health,
    isComplete: isStep7Complete,
  },
];

function PlaceholderStep({ label }) {
  return (
    <View style={styles.placeholder}>
      <Text style={styles.placeholderText}>
        The {label} step hasn’t been built yet — this placeholder confirms the
        shared wrapper works for every step.
      </Text>
    </View>
  );
}

function OnboardingFlow({ navigation }) {
  const { answers, stepIndex, goNext, goBack } = useOnboarding();
  const { logout } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const step = STEPS[stepIndex];
  const isLastStep = stepIndex === TOTAL_STEPS - 1;
  const StepBody = step.component;

  async function handleSubmit() {
    setError('');
    setSubmitting(true);
    try {
      // Two writes: raw personalisation answers → health_inputs, and the
      // BRFSS-coded 7 model features → ML prediction (stored server-side)
      await api.saveHealthInputs(buildHealthInputsPayload(answers));
      const modelPayload = buildModelPayload(answers);
      await api.createPrediction(modelPayload);

      // Generate this month's habit set + score reasoning right away, using
      // the exact same endpoint/logic the Habits tab's manual button calls —
      // otherwise Home would show an alarming risk breakdown with no
      // explanation until the user happened to visit Habits and tap Generate.
      // Same loading state stays on through this call (still inside
      // `submitting`), so there's one continuous spinner, not a false "done"
      // moment. This counts as the month's generation server-side (idempotent
      // per month), so the Habits tab won't prompt again until next month.
      // Gemini failures are already handled inside /api/habits/generate
      // (falls back to the default habit list + generic reasoning) so this
      // doesn't throw for that reason; a genuine network/backend hiccup here
      // is swallowed rather than blocking the user out of the app — Home and
      // Habits just fall back to showing the manual generate prompt.
      try {
        await api.generateHabitSet(localMonth());
      } catch (genErr) {
        console.warn('Automatic habit generation failed after onboarding:', genErr.message);
      }

      navigation.reset({ index: 0, routes: [{ name: 'MainTabs' }] });
    } catch (e) {
      setError(e.message || 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  function handleBack() {
    if (stepIndex > 0) {
      goBack();
    } else if (navigation.canGoBack()) {
      navigation.goBack();
    }
  }

  function handleContinue() {
    setError('');
    if (isLastStep) {
      handleSubmit();
    } else {
      goNext();
    }
  }

  // logout() clears the token and flips AuthContext's `user` to null —
  // AppNavigator swaps to AuthStack on its own, no explicit navigate needed
  // (same pattern as the Home profile icon).
  function handleLogout() {
    logout();
  }

  // Leaves onboarding without submitting — answers held in OnboardingContext
  // are simply discarded when this screen unmounts. No prediction is created.
  function handleSkipToDashboard() {
    navigation.reset({ index: 0, routes: [{ name: 'MainTabs' }] });
  }

  return (
    <StepScreen
      stepNumber={stepIndex + 1}
      totalSteps={TOTAL_STEPS}
      label={step.label}
      icon={step.icon}
      title={step.title}
      subtitle={step.subtitle}
      onBack={handleBack}
      onContinue={handleContinue}
      continueDisabled={!step.isComplete(answers)}
      continueLabel={isLastStep ? 'Finish' : 'Continue'}
      loading={submitting}
      error={error}
      onLogout={handleLogout}
      onSkipToDashboard={handleSkipToDashboard}
    >
      {StepBody ? <StepBody /> : <PlaceholderStep label={step.label} />}
    </StepScreen>
  );
}

export default function OnboardingScreen({ navigation }) {
  return (
    <OnboardingProvider>
      <OnboardingFlow navigation={navigation} />
    </OnboardingProvider>
  );
}

const styles = StyleSheet.create({
  placeholder: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 20,
  },
  placeholderText: {
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.textMuted,
    lineHeight: 22,
  },
});
