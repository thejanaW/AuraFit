import React, { useCallback, useEffect, useState } from 'react';
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

import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { colors, fonts, cardStyle } from '../theme';

// TEMPORARY (Chunk 3): hardcoded habits matching the Figma design, shown until
// Gemini habit generation is wired up. Replace with GET /api/habits/today once
// the Gemini pipeline + habits table flow exists.
const PLACEHOLDER_HABITS = [
  { id: 'ph-1', title: 'Drink 8 glasses of water', subtext: 'Hydration supports blood pressure', points: 10, completed: true },
  { id: 'ph-2', title: '30 minute brisk walk', subtext: 'Cardio lowers heart disease risk', points: 20, completed: false },
  { id: 'ph-3', title: 'No screens after 10pm', subtext: 'Better sleep, lower stress', points: 15, completed: false },
];
const HABITS_PER_DAY = 5; // daily checklist size once Gemini generation lands

function timeGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

// TODO: users table has no display-name column yet — derive one from the email
// prefix until a profile/name field exists (e.g. collected during onboarding).
function displayName(email) {
  if (!email) return 'there';
  const prefix = email.split('@')[0];
  return prefix.charAt(0).toUpperCase() + prefix.slice(1);
}

export default function HomeScreen() {
  const { user, logout } = useAuth();
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [prediction, setPrediction] = useState(null);
  const [previous, setPrevious] = useState(null);
  const [pointsTotal, setPointsTotal] = useState(0);

  const loadDashboard = useCallback(async () => {
    setError(null);
    try {
      const [predRes, pointsRes] = await Promise.all([
        api.getLatestPrediction(),
        api.getPointsTotal(),
      ]);
      setPrediction(predRes.prediction);
      setPrevious(predRes.previous);
      setPointsTotal(pointsRes.total);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    loadDashboard().finally(() => setLoading(false));
  }, [loadDashboard]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadDashboard();
    setRefreshing(false);
  }, [loadDashboard]);

  const score = prediction ? Math.round(prediction.predicted_health_score) : null;

  // Week-trend: % change of latest score vs the previous prediction. Hidden
  // entirely when there's only one prediction on record — no fake/zero trend.
  // TODO: once re-assessment exists, revisit whether "this week" should compare
  // by date window rather than just the two most recent rows.
  const trend =
    prediction && previous && previous.predicted_health_score > 0
      ? ((prediction.predicted_health_score - previous.predicted_health_score) /
          previous.predicted_health_score) *
        100
      : null;

  const completedCount = PLACEHOLDER_HABITS.filter((h) => h.completed).length;

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
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 12 }]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.accent}
          />
        }
      >
        {/* Header: greeting left, bell + profile right */}
        <View style={styles.headerRow}>
          <View style={styles.flex}>
            <Text style={styles.greetingSmall}>{timeGreeting()},</Text>
            <Text style={styles.greetingName}>{displayName(user?.email)}</Text>
          </View>
          <TouchableOpacity style={styles.iconButton}>
            <Ionicons name="notifications-outline" size={20} color={colors.textSecondary} />
          </TouchableOpacity>
          {/* TEMPORARY: profile icon logs out until the Profile screen exists */}
          <TouchableOpacity style={styles.iconButton} onPress={logout}>
            <Ionicons name="person-outline" size={20} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* Avatar placeholder with glow — real Digital Twin avatar comes later in Chunk 3 */}
        <View style={styles.avatarArea}>
          <View style={styles.avatarGlowOuter}>
            <View style={styles.avatarGlowInner}>
              <View style={styles.avatarCircle}>
                <Ionicons name="body-outline" size={64} color={colors.accent} />
              </View>
            </View>
          </View>
        </View>

        {/* Aura score */}
        <View style={styles.scoreArea}>
          <Text style={styles.scoreLabel}>AURA SCORE</Text>
          {score !== null ? (
            <>
              <View style={styles.scoreRow}>
                <Text style={styles.scoreValue}>{score}</Text>
                <Text style={styles.scoreMax}>/100</Text>
              </View>
              {/* The model payload projects age +10y (see onboardingPayloads.js
                  RISK_PROJECTION_YEARS) — the score is a projection, and the
                  UI must say so wherever it appears */}
              <Text style={styles.scoreProjectionNote}>
                Reflects your risk in ~10 years if these habits continue
              </Text>
            </>
          ) : (
            <>
              <Text style={styles.scoreValue}>—</Text>
              <Text style={styles.scoreEmpty}>
                Complete onboarding to see your score
              </Text>
            </>
          )}
        </View>

        {error && (
          <TouchableOpacity style={styles.errorCard} onPress={onRefresh}>
            <Text style={styles.errorText}>{error}</Text>
            <Text style={styles.errorRetry}>Tap to retry</Text>
          </TouchableOpacity>
        )}

        {/* Points + streak stat cards */}
        <View style={styles.statRow}>
          <View style={[styles.statCard, styles.statCardLeft]}>
            <Text style={styles.statLabel}>POINTS</Text>
            <Text style={styles.statValue}>{pointsTotal}</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>STREAK</Text>
            {/* TODO: streak logic doesn't exist yet — build once habit
                completion tracking lands, then count consecutive active days */}
            <Text style={styles.statValue}>
              0<Text style={styles.statUnit}> days</Text>
            </Text>
          </View>
        </View>

        {/* Week trend — only rendered when a previous prediction exists */}
        {trend !== null && (
          <View style={styles.trendCard}>
            <View style={styles.flex}>
              <Text style={styles.trendLabel}>This week's trend</Text>
              <Text style={styles.trendSub}>vs your previous assessment</Text>
            </View>
            <View style={styles.trendValueRow}>
              <Ionicons
                name={trend >= 0 ? 'trending-up' : 'trending-down'}
                size={20}
                color={trend >= 0 ? colors.positive : colors.negative}
              />
              <Text
                style={[
                  styles.trendValue,
                  { color: trend >= 0 ? colors.positive : colors.negative },
                ]}
              >
                {trend >= 0 ? '+' : ''}
                {trend.toFixed(1)}%
              </Text>
            </View>
          </View>
        )}

        {/* Today's habits (placeholder set — see PLACEHOLDER_HABITS above) */}
        <View style={styles.habitsHeader}>
          <Text style={styles.sectionTitle}>Today's habits</Text>
          <Text style={styles.habitsCount}>
            {completedCount}/{HABITS_PER_DAY} complete
          </Text>
        </View>
        {PLACEHOLDER_HABITS.map((habit) => (
          <View key={habit.id} style={styles.habitRow}>
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
          </View>
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
    alignItems: 'center',
    marginBottom: 8,
  },
  greetingSmall: {
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.textSecondary,
  },
  greetingName: {
    fontFamily: fonts.semibold,
    fontSize: 22,
    color: colors.text,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 10,
  },
  avatarArea: {
    alignItems: 'center',
    marginTop: 20,
  },
  avatarGlowOuter: {
    width: 176,
    height: 176,
    borderRadius: 88,
    backgroundColor: 'rgba(255, 90, 54, 0.07)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarGlowInner: {
    width: 152,
    height: 152,
    borderRadius: 76,
    backgroundColor: 'rgba(255, 90, 54, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarCircle: {
    width: 128,
    height: 128,
    borderRadius: 64,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.accent,
    shadowOpacity: 0.45,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 0 },
    elevation: 10,
  },
  scoreArea: {
    alignItems: 'center',
    marginTop: 16,
    marginBottom: 20,
  },
  scoreLabel: {
    fontFamily: fonts.medium,
    fontSize: 12,
    letterSpacing: 2,
    color: colors.textSecondary,
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  scoreValue: {
    fontFamily: fonts.bold,
    fontSize: 64,
    lineHeight: 72,
    color: colors.text,
  },
  scoreMax: {
    fontFamily: fonts.medium,
    fontSize: 20,
    color: colors.textMuted,
    marginBottom: 12,
    marginLeft: 4,
  },
  scoreProjectionNote: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 4,
    textAlign: 'center',
  },
  scoreEmpty: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 4,
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
  statRow: {
    flexDirection: 'row',
    marginBottom: 14,
  },
  statCard: {
    ...cardStyle,
    flex: 1,
    padding: 18,
  },
  statCardLeft: {
    marginRight: 14,
  },
  statLabel: {
    fontFamily: fonts.medium,
    fontSize: 11,
    letterSpacing: 1.5,
    color: colors.textSecondary,
    marginBottom: 6,
  },
  statValue: {
    fontFamily: fonts.bold,
    fontSize: 28,
    color: colors.text,
  },
  statUnit: {
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.textMuted,
  },
  trendCard: {
    ...cardStyle,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 18,
    marginBottom: 24,
  },
  trendLabel: {
    fontFamily: fonts.semibold,
    fontSize: 14,
    color: colors.text,
  },
  trendSub: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  trendValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  trendValue: {
    fontFamily: fonts.bold,
    fontSize: 18,
    marginLeft: 6,
  },
  habitsHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginTop: 4,
    marginBottom: 12,
  },
  sectionTitle: {
    fontFamily: fonts.semibold,
    fontSize: 17,
    color: colors.text,
  },
  habitsCount: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: colors.textSecondary,
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
