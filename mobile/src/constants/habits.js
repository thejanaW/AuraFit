// FALLBACK ONLY (since Gemini habit generation landed): habit sets are now
// generated server-side per month (POST /api/habits/generate) and this list
// is what the BACKEND falls back to when Gemini fails — the runtime copy
// lives in backend/src/constants/fallbackHabits.js; keep the two in sync.
// Kept here (unused by app code) as the canonical reference for that list.
export const PLACEHOLDER_HABITS = [
  {
    id: 'ph-walk',
    title: 'Walk 7,000 steps',
    subtext: 'Daily movement lowers heart disease risk',
    points: 20,
  },
  {
    id: 'ph-water',
    title: 'Drink 2L water',
    subtext: 'Hydration supports healthy blood pressure',
    points: 10,
  },
  {
    id: 'ph-sleep',
    title: 'Sleep before 11:30pm',
    subtext: 'Consistent sleep lowers stress and BP',
    points: 15,
  },
  {
    id: 'ph-mobility',
    title: '10-min mobility flow',
    subtext: 'Keeps joints healthy, builds the routine',
    points: 15,
  },
  {
    id: 'ph-veg',
    title: 'Eat 2 portions of veg',
    subtext: 'Supports weight and diabetes risk',
    points: 10,
  },
];
