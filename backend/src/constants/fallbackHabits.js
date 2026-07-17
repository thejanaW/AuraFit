// Fallback habit set used when Gemini generation fails (API error, malformed
// JSON, missing fields). Mirrors mobile/src/constants/habits.js — keep the two
// lists in sync. Shape matches habit_set_items (points_value, not points).
const FALLBACK_HABITS = [
  {
    title: 'Walk 7,000 steps',
    subtext: 'Daily movement lowers heart disease risk',
    points_value: 20,
  },
  {
    title: 'Drink 2L water',
    subtext: 'Hydration supports healthy blood pressure',
    points_value: 10,
  },
  {
    title: 'Sleep before 11:30pm',
    subtext: 'Consistent sleep lowers stress and BP',
    points_value: 15,
  },
  {
    title: '10-min mobility flow',
    subtext: 'Keeps joints healthy, builds the routine',
    points_value: 15,
  },
  {
    title: 'Eat 2 portions of veg',
    subtext: 'Supports weight and diabetes risk',
    points_value: 10,
  },
];

const FALLBACK_REASONING =
  'Your risk reflects your current lifestyle patterns — check your risk breakdown above for specifics.';

module.exports = { FALLBACK_HABITS, FALLBACK_REASONING };
