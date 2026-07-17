import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';

import { useHabits } from '../context/HabitsContext';
import { colors, fonts, cardStyle } from '../theme';

// Habits tab — the daily checklist, matching the Figma "TODAY / Your habits"
// screen. The list is the month's Gemini-generated set; until one exists for
// the current month, a generate prompt is shown instead of the checklist.
export default function HabitsScreen() {
  const insets = useSafeAreaInsets();
  const {
    habits,
    completedCount,
    hasCurrentSet,
    monthLabel,
    loading,
    generating,
    error,
    refresh,
    generate,
    toggleHabit,
  } = useHabits();
  const [refreshing, setRefreshing] = useState(false);

  // Quiet re-sync on every visit — also rolls the checklist over to a fresh
  // day if the app stayed open past midnight.
  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  const ratio = habits.length > 0 ? completedCount / habits.length : 0;

  if (loading) {
    return (
      <LinearGradient colors={colors.backgroundGradient} style={styles.center}>
        <ActivityIndicator color={colors.accent} size="large" />
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={colors.backgroundGradient} style={styles.flex}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 16 }]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.accent}
          />
        }
      >
        {/* Header: TODAY / Your habits left, big completion count right */}
        <View style={styles.headerRow}>
          <View style={styles.flex}>
            <Text style={styles.todayLabel}>TODAY</Text>
            <Text style={styles.title}>Your habits</Text>
          </View>
          {hasCurrentSet && (
            <View style={styles.countBlock}>
              <Text style={styles.countValue}>
                {completedCount}/{habits.length}
              </Text>
              <Text style={styles.countLabel}>COMPLETE</Text>
            </View>
          )}
        </View>

        {/* Thin progress bar, filled by completion ratio */}
        {hasCurrentSet && (
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${ratio * 100}%` }]} />
          </View>
        )}

        {error && (
          <TouchableOpacity style={styles.errorCard} onPress={refresh}>
            <Text style={styles.errorText}>{error}</Text>
            <Text style={styles.errorRetry}>Tap to retry</Text>
          </TouchableOpacity>
        )}

        {/* No set yet for this month → generate prompt; otherwise a subtle
            "already generated" marker replaces the button entirely */}
        {!hasCurrentSet ? (
          <View style={styles.generateCard}>
            <Ionicons name="sparkles-outline" size={28} color={colors.accent} />
            <Text style={styles.generateTitle}>
              No habits for {monthLabel} yet
            </Text>
            <Text style={styles.generateSub}>
              Generate a personalised checklist from your risk breakdown,
              lifestyle answers and last month's progress.
            </Text>
            <TouchableOpacity
              style={[styles.generateButton, generating && styles.generateButtonBusy]}
              onPress={generate}
              disabled={generating}
              activeOpacity={0.8}
            >
              {generating ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.generateButtonText}>
                  Generate this month's habits
                </Text>
              )}
            </TouchableOpacity>
          </View>
        ) : (
          <Text style={styles.generatedFor}>Generated for {monthLabel}</Text>
        )}

        {habits.map((habit) => (
          <TouchableOpacity
            key={habit.id}
            style={styles.habitRow}
            activeOpacity={0.7}
            onPress={() => toggleHabit(habit)}
          >
            <View
              style={[styles.habitCheck, habit.completed && styles.habitCheckDone]}
            >
              {habit.completed && (
                <Ionicons name="checkmark" size={14} color="#fff" />
              )}
            </View>
            <View style={styles.flex}>
              <Text
                style={[styles.habitTitle, habit.completed && styles.habitTitleDone]}
              >
                {habit.title}
              </Text>
              <Text style={styles.habitSub}>{habit.subtext}</Text>
            </View>
            <Text style={styles.habitPoints}>+{habit.points}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 32,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginBottom: 18,
  },
  todayLabel: {
    fontFamily: fonts.medium,
    fontSize: 11,
    letterSpacing: 2,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  title: {
    fontFamily: fonts.bold,
    fontSize: 26,
    color: colors.text,
  },
  countBlock: {
    alignItems: 'flex-end',
  },
  countValue: {
    fontFamily: fonts.bold,
    fontSize: 26,
    color: colors.text,
  },
  countLabel: {
    fontFamily: fonts.medium,
    fontSize: 10,
    letterSpacing: 1.5,
    color: colors.textSecondary,
    marginTop: 2,
  },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.border,
    overflow: 'hidden',
    marginBottom: 22,
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
    backgroundColor: colors.accent,
  },
  errorCard: {
    ...cardStyle,
    borderColor: colors.negative,
    padding: 14,
    alignItems: 'center',
    marginBottom: 16,
  },
  errorText: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.negative,
    textAlign: 'center',
  },
  errorRetry: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 4,
  },
  generateCard: {
    ...cardStyle,
    alignItems: 'center',
    padding: 24,
    marginTop: 8,
  },
  generateTitle: {
    fontFamily: fonts.semibold,
    fontSize: 16,
    color: colors.text,
    marginTop: 12,
  },
  generateSub: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 6,
    marginBottom: 18,
    lineHeight: 19,
  },
  generateButton: {
    backgroundColor: colors.accent,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'stretch',
    minHeight: 48,
  },
  generateButtonBusy: {
    opacity: 0.7,
  },
  generateButtonText: {
    fontFamily: fonts.semibold,
    fontSize: 15,
    color: '#fff',
  },
  generatedFor: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.textMuted,
    marginBottom: 12,
  },
  habitRow: {
    ...cardStyle,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    marginBottom: 10,
  },
  habitCheck: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: colors.textFaint,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  habitCheckDone: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  habitTitle: {
    fontFamily: fonts.medium,
    fontSize: 14,
    color: colors.text,
  },
  habitTitleDone: {
    color: colors.textMuted,
    textDecorationLine: 'line-through',
  },
  habitSub: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 1,
  },
  habitPoints: {
    fontFamily: fonts.semibold,
    fontSize: 14,
    color: colors.accent,
    marginLeft: 12,
  },
});
