import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { api } from '../services/api';

// Local calendar date/month (NOT UTC) — the phone decides when "today" and
// "this month" roll over.
function localToday() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function localMonth() {
  return localToday().slice(0, 7);
}

// 'YYYY-MM' → 'July'
function monthName(month) {
  const [year, m] = month.split('-').map(Number);
  return new Date(year, m - 1, 1).toLocaleDateString('en-GB', { month: 'long' });
}

// Shared habits state, mounted around MainTabs so the Home dashboard and the
// Habits tab always show the SAME data — a toggle on the Habits screen
// updates Home instantly, no refetch needed.
//
// The habit list itself is the month's Gemini-generated set (habit_sets /
// habit_set_items server-side; hardcoded fallback if Gemini failed). Until
// the user generates a set for the current month, `habits` is empty and
// `hasCurrentSet` is false — screens show a generate prompt instead.
const HabitsContext = createContext(null);

export function HabitsProvider({ children }) {
  const [set, setSet] = useState(null); // { id, month, reasoning, source, habits }
  const [rowsByItemId, setRowsByItemId] = useState({}); // today's completion rows
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const [setRes, todayRes] = await Promise.all([
        api.getCurrentHabitSet(localMonth()),
        api.getTodayHabits(localToday()),
      ]);
      setSet(setRes.set);
      const byItemId = {};
      for (const row of todayRes.habits) {
        if (row.habit_item_id) byItemId[row.habit_item_id] = row;
      }
      setRowsByItemId(byItemId);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, [refresh]);

  // Ask the backend to generate this month's set (Gemini, with server-side
  // fallback). Idempotent server-side, so a double-tap can't create duplicates.
  const generate = useCallback(async () => {
    setGenerating(true);
    setError(null);
    try {
      const { set: newSet } = await api.generateHabitSet(localMonth());
      setSet(newSet);
    } catch (err) {
      setError(err.message);
    } finally {
      setGenerating(false);
    }
  }, []);

  const habits = useMemo(
    () =>
      (set?.habits ?? []).map((item) => ({
        id: item.id, // habit_set_items id — what /complete references
        title: item.title,
        subtext: item.subtext,
        points: item.points_value,
        completed: rowsByItemId[item.id]?.completed ?? false,
      })),
    [set, rowsByItemId]
  );

  const completedCount = useMemo(
    () => habits.filter((h) => h.completed).length,
    [habits]
  );

  // Optimistic toggle: flip locally first, persist, revert on failure.
  const toggleHabit = useCallback(async (habit) => {
    const next = !habit.completed;
    setRowsByItemId((prev) => ({
      ...prev,
      [habit.id]: { ...(prev[habit.id] ?? { habit_item_id: habit.id }), completed: next },
    }));
    try {
      const { habit: saved } = await api.toggleHabit({
        habit_item_id: habit.id,
        date: localToday(),
        completed: next,
      });
      setRowsByItemId((prev) => ({ ...prev, [saved.habit_item_id]: saved }));
    } catch (err) {
      setRowsByItemId((prev) => ({
        ...prev,
        [habit.id]: { ...(prev[habit.id] ?? { habit_item_id: habit.id }), completed: !next },
      }));
      setError(err.message);
    }
  }, []);

  const value = {
    habits,
    completedCount,
    hasCurrentSet: !!set,
    reasoning: set?.reasoning ?? null,
    monthLabel: monthName(localMonth()),
    loading,
    generating,
    error,
    refresh,
    generate,
    toggleHabit,
  };
  return <HabitsContext.Provider value={value}>{children}</HabitsContext.Provider>;
}

export function useHabits() {
  const ctx = useContext(HabitsContext);
  if (!ctx) throw new Error('useHabits must be used inside a HabitsProvider');
  return ctx;
}
