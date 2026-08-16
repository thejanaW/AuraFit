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

import { useAuth } from '../context/AuthContext';
import { useHabits } from '../context/HabitsContext';
import { api } from '../services/api';
import { localToday } from '../utils/date';
import { colors, fonts, cardStyle } from '../theme';

// Per-condition risk breakdown (predictions.risk_breakdown jsonb). Labels are
// the four real model conditions — deliberately NOT the older Figma screen's
// categories ("Cardiovascular", "Mental Wellbeing"), which don't match what
// the models actually predict. Band → 1-3 segments + a themed status color.
const RISK_CONDITIONS = [
  { key: 'heart_attack', label: 'Heart Attack' },
  { key: 'heart_disease', label: 'Heart Disease' },
  { key: 'diabetes', label: 'Diabetes' },
  { key: 'high_bp', label: 'High Blood Pressure' },
];
const RISK_BAND_SEGMENTS = { Low: 1, Moderate: 2, High: 3 };
const RISK_BAND_COLORS = {
  Low: colors.positive,
  Moderate: colors.warning,
  High: colors.negative,
};

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

export default function HomeScreen({ navigation }) {
  const { user, logout } = useAuth();
  const insets = useSafeAreaInsets();
  // Shared habits state (see HabitsContext) — a toggle on the Habits tab is
  // reflected here immediately, both screens read the same object. reasoning
  // is the Gemini "why your score looks this way" text stored with the set.
  const { habits, completedCount, hasCurrentSet, reasoning, monthLabel } = useHabits();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [prediction, setPrediction] = useState(null);
  const [previous, setPrevious] = useState(null);
  const [pointsTotal, setPointsTotal] = useState(0);
  const [streak, setStreak] = useState(0);

  const loadDashboard = useCallback(async () => {
    setError(null);
    try {
      const [predRes, pointsRes, streakRes] = await Promise.all([
        api.getLatestPrediction(),
        api.getPointsTotal(),
        api.getStreak(localToday()),
      ]);
      setPrediction(predRes.prediction);
      setPrevious(predRes.previous);
      setPointsTotal(pointsRes.total);
      setStreak(streakRes.streak);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  // Refetch on every focus (not just mount) so the POINTS card picks up habit
  // completions logged on the Habits tab; spinner only blocks the first load.
  useFocusEffect(
    useCallback(() => {
      loadDashboard().finally(() => setLoading(false));
    }, [loadDashboard])
  );

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

        {error && (
          <TouchableOpacity style={styles.errorCard} onPress={onRefresh}>
            <Text style={styles.errorText}>{error}</Text>
            <Text style={styles.errorRetry}>Tap to retry</Text>
          </TouchableOpacity>
        )}

        {prediction ? (
          <>
            {/* Aura score */}
            <View style={styles.scoreArea}>
              <Text style={styles.scoreLabel}>AURA SCORE</Text>
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
            </View>

            {/* Points + streak stat cards */}
            <View style={styles.statRow}>
              <View style={[styles.statCard, styles.statCardLeft]}>
                <Text style={styles.statLabel}>POINTS</Text>
                <Text style={styles.statValue}>{pointsTotal}</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statLabel}>STREAK</Text>
                {/* Consecutive days with ≥1 completed habit (GET /api/streak);
                    refreshes on focus along with the rest of the dashboard */}
                <Text style={styles.statValue}>
                  {streak}
                  <Text style={styles.statUnit}>{streak === 1 ? ' day' : ' days'}</Text>
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

            {/* ~10 year per-condition risk breakdown, from the same
                /api/predictions/latest payload as the score and trend.
                "~10 YEAR" matches the score subtext and the actual
                RISK_PROJECTION_YEARS = 10 driving the projection — one
                consistent horizon phrase, not the older "5-10 year" copy */}
            <Text style={styles.riskHeader}>~10 YEAR RISK BREAKDOWN</Text>
            {prediction?.risk_breakdown ? (
              RISK_CONDITIONS.map(({ key, label }) => {
                const band = prediction.risk_breakdown[key];
                const segments = RISK_BAND_SEGMENTS[band] || 0;
                const bandColor = RISK_BAND_COLORS[band] || colors.textMuted;
                return (
                  <View key={key} style={styles.riskCard}>
                    <View style={styles.riskCardTop}>
                      <Text style={styles.riskCondition}>{label}</Text>
                      <Text style={[styles.riskBand, { color: bandColor }]}>
                        {band || '—'}
                      </Text>
                    </View>
                    <View style={styles.riskBarRow}>
                      {[1, 2, 3].map((segment) => (
                        <View
                          key={segment}
                          style={[
                            styles.riskBarSegment,
                            segment <= segments && { backgroundColor: bandColor },
                          ]}
                        />
                      ))}
                    </View>
                  </View>
                );
              })
            ) : (
              <View style={styles.riskEmptyCard}>
                <Text style={styles.riskEmptyText}>
                  Your risk breakdown appears here once your first assessment is
                  complete
                </Text>
              </View>
            )}

            {/* Gemini's plain-language "why" for the score/bands — stored with the
                month's habit set. Deliberately visually secondary to the score. */}
            {reasoning && (
              <View style={styles.reasoningCard}>
                <Text style={styles.reasoningLabel}>WHY YOUR SCORE LOOKS THIS WAY</Text>
                <Text style={styles.reasoningText}>{reasoning}</Text>
              </View>
            )}

            {/* Today's habits — read-only summary of the shared checklist state;
                toggling (and generating) lives on the Habits tab */}
            <View style={styles.habitsHeader}>
              <Text style={styles.sectionTitle}>Today's habits</Text>
              {hasCurrentSet && (
                <Text style={styles.habitsCount}>
                  {completedCount}/{habits.length} complete
                </Text>
              )}
            </View>
            {hasCurrentSet ? (
              habits.map((habit) => (
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
              ))
            ) : (
              <View style={styles.habitsEmptyCard}>
                <Text style={styles.habitsEmptyText}>
                  No habits for {monthLabel} yet — generate your personalised set on
                  the Habits tab.
                </Text>
              </View>
            )}
          </>
        ) : (
          // No prediction on record yet — either a brand-new signup or a
          // user who tapped "Skip to Dashboard" during onboarding. Re-checked
          // on every load (not just right after skipping), since loadDashboard
          // always re-fetches GET /api/predictions/latest above.
          <View style={styles.startCard}>
            <View style={styles.startIconWrap}>
              <Ionicons name="analytics-outline" size={28} color={colors.accent} />
            </View>
            <Text style={styles.startHeadline}>
              Get your personalised health risk score
            </Text>
            <Text style={styles.startSubtext}>
              Answer a few quick questions about your lifestyle and we'll project
              your ~10-year health risk across four key conditions.
            </Text>
            <TouchableOpacity
              style={styles.startButton}
              onPress={() => navigation.navigate('Onboarding')}
            >
              <Text style={styles.startButtonText}>Start My Analysis</Text>
            </TouchableOpacity>
          </View>
        )}
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
  startCard: {
    ...cardStyle,
    alignItems: 'center',
    padding: 28,
    marginTop: 8,
  },
  startIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255, 90, 54, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  startHeadline: {
    fontFamily: fonts.semibold,
    fontSize: 19,
    color: colors.text,
    textAlign: 'center',
    marginBottom: 8,
  },
  startSubtext: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 22,
  },
  startButton: {
    backgroundColor: colors.accent,
    borderRadius: 999,
    paddingVertical: 15,
    paddingHorizontal: 32,
    alignItems: 'center',
  },
  startButtonText: {
    fontFamily: fonts.semibold,
    fontSize: 15,
    color: colors.text,
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
  riskHeader: {
    fontFamily: fonts.medium,
    fontSize: 11,
    letterSpacing: 1.5,
    color: colors.textSecondary,
    marginTop: 6,
    marginBottom: 12,
  },
  riskCard: {
    ...cardStyle,
    padding: 16,
    marginBottom: 10,
  },
  riskCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  riskCondition: {
    fontFamily: fonts.semibold,
    fontSize: 14,
    color: colors.text,
  },
  riskBand: {
    fontFamily: fonts.semibold,
    fontSize: 13,
  },
  riskBarRow: {
    flexDirection: 'row',
    gap: 6,
  },
  riskBarSegment: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.border,
  },
  riskEmptyCard: {
    ...cardStyle,
    padding: 16,
    alignItems: 'center',
    marginBottom: 10,
  },
  riskEmptyText: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.textMuted,
    textAlign: 'center',
  },
  reasoningCard: {
    ...cardStyle,
    padding: 16,
    marginTop: 4,
    marginBottom: 24,
  },
  reasoningLabel: {
    fontFamily: fonts.medium,
    fontSize: 10,
    letterSpacing: 1.5,
    color: colors.textSecondary,
    marginBottom: 8,
  },
  reasoningText: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.textMuted,
    lineHeight: 20,
  },
  habitsEmptyCard: {
    ...cardStyle,
    padding: 16,
    alignItems: 'center',
  },
  habitsEmptyText: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 19,
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
