import React, { createContext, useContext, useState } from 'react';

// Holds all onboarding answers in one object keyed by canonical answer keys
// (see utils/onboardingPayloads.js). Answers live here — not in the step
// components — so navigating back and forth never loses data.

export const TOTAL_STEPS = 7;

const OnboardingContext = createContext(null);

export function OnboardingProvider({ children }) {
  const [answers, setAnswers] = useState({});
  const [stepIndex, setStepIndex] = useState(0); // 0-based; step 1 of 7 = index 0

  const setAnswer = (key, value) =>
    setAnswers((prev) => ({ ...prev, [key]: value }));

  const goNext = () =>
    setStepIndex((i) => Math.min(i + 1, TOTAL_STEPS - 1));

  const goBack = () =>
    setStepIndex((i) => Math.max(i - 1, 0));

  return (
    <OnboardingContext.Provider
      value={{ answers, setAnswer, stepIndex, goNext, goBack }}
    >
      {children}
    </OnboardingContext.Provider>
  );
}

export function useOnboarding() {
  const ctx = useContext(OnboardingContext);
  if (!ctx) throw new Error('useOnboarding must be used inside OnboardingProvider');
  return ctx;
}
