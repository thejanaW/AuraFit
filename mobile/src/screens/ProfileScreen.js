import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
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
import { api } from '../services/api';
import { colors, fonts, cardStyle } from '../theme';
import DeleteAccountModal from '../components/DeleteAccountModal';

// Same email-prefix fallback as HomeScreen, for users with no stored name
// (pre-migration-006 accounts, or older client builds).
function displayName(user) {
  if (user?.name) return user.name;
  if (!user?.email) return 'there';
  const prefix = user.email.split('@')[0];
  return prefix.charAt(0).toUpperCase() + prefix.slice(1);
}

// Real Profile screen — replaces the old "profile icon just logs out" stopgap
// on Home. Reachable via Home's profile icon; Log Out now lives here instead.
export default function ProfileScreen({ navigation }) {
  const { user, logout } = useAuth();
  const insets = useSafeAreaInsets();
  const [score, setScore] = useState(null);
  const [loading, setLoading] = useState(true);
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);

  // Throws on failure so DeleteAccountModal's own error handling shows it
  // inline (e.g. wrong password) instead of the account being torn down
  // client-side on a request that didn't actually succeed server-side.
  async function handleDeleteAccount(password) {
    await api.deleteAccount(password);
    setDeleteModalVisible(false);
    await logout(); // clears stored token/user; AppNavigator bounces to Login
  }

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        try {
          const { prediction } = await api.getLatestPrediction();
          if (!cancelled) {
            setScore(prediction ? Math.round(prediction.predicted_health_score) : null);
          }
        } catch {
          // Non-fatal — the score summary just stays hidden; Home already
          // surfaces its own retry affordance for prediction load failures.
          if (!cancelled) setScore(null);
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [])
  );

  return (
    <LinearGradient colors={colors.backgroundGradient} style={styles.flex}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 12 }]}
      >
        <View style={styles.topBar}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
            hitSlop={12}
          >
            <Ionicons name="chevron-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.topBarTitle}>Profile</Text>
          <View style={styles.backButton} />
        </View>

        <View style={styles.avatarWrap}>
          <View style={styles.avatarCircle}>
            <Ionicons name="person" size={40} color={colors.accent} />
          </View>
          <Text style={styles.name}>{displayName(user)}</Text>
          <Text style={styles.email}>{user?.email}</Text>
        </View>

        <View style={styles.scoreCard}>
          <Text style={styles.scoreLabel}>AURA SCORE</Text>
          {loading ? (
            <ActivityIndicator color={colors.accent} style={styles.scoreSpinner} />
          ) : score != null ? (
            <View style={styles.scoreRow}>
              <Text style={styles.scoreValue}>{score}</Text>
              <Text style={styles.scoreMax}>/100</Text>
            </View>
          ) : (
            <Text style={styles.scoreEmpty}>No assessment yet</Text>
          )}
        </View>

        <TouchableOpacity
          style={styles.couponsButton}
          onPress={() => navigation.navigate('Coupons')}
          activeOpacity={0.8}
        >
          <View style={styles.couponsButtonLeft}>
            <Ionicons name="gift-outline" size={18} color={colors.accent} />
            <Text style={styles.couponsButtonText}>My Coupons</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
        </TouchableOpacity>

        <TouchableOpacity style={styles.logoutButton} onPress={logout} activeOpacity={0.8}>
          <Ionicons name="log-out-outline" size={18} color={colors.negative} />
          <Text style={styles.logoutText}>Log Out</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.deleteAccountButton}
          onPress={() => setDeleteModalVisible(true)}
          activeOpacity={0.8}
        >
          <Text style={styles.deleteAccountText}>Delete Account</Text>
        </TouchableOpacity>
      </ScrollView>

      <DeleteAccountModal
        visible={deleteModalVisible}
        onClose={() => setDeleteModalVisible(false)}
        onConfirm={handleDeleteAccount}
      />
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 32,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topBarTitle: {
    fontFamily: fonts.semibold,
    fontSize: 16,
    color: colors.text,
  },
  avatarWrap: {
    alignItems: 'center',
    marginTop: 24,
    marginBottom: 28,
  },
  avatarCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  name: {
    fontFamily: fonts.bold,
    fontSize: 20,
    color: colors.text,
  },
  email: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 4,
  },
  scoreCard: {
    ...cardStyle,
    alignItems: 'center',
    padding: 22,
    marginBottom: 24,
  },
  scoreLabel: {
    fontFamily: fonts.medium,
    fontSize: 11,
    letterSpacing: 1.5,
    color: colors.textSecondary,
    marginBottom: 8,
  },
  scoreSpinner: {
    marginTop: 4,
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  scoreValue: {
    fontFamily: fonts.bold,
    fontSize: 40,
    lineHeight: 46,
    color: colors.text,
  },
  scoreMax: {
    fontFamily: fonts.medium,
    fontSize: 16,
    color: colors.textMuted,
    marginBottom: 6,
    marginLeft: 3,
  },
  scoreEmpty: {
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.textMuted,
  },
  couponsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    ...cardStyle,
    paddingVertical: 15,
    paddingHorizontal: 18,
    marginBottom: 12,
  },
  couponsButtonLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  couponsButtonText: {
    fontFamily: fonts.medium,
    fontSize: 15,
    color: colors.text,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    ...cardStyle,
    borderColor: colors.negative,
    paddingVertical: 15,
    gap: 8,
  },
  logoutText: {
    fontFamily: fonts.semibold,
    fontSize: 15,
    color: colors.negative,
  },
  // Deliberately quieter than Log Out — a plain text link, not a bordered
  // button, so it doesn't compete for attention with an everyday action but
  // is still clearly there and clearly red for an irreversible one.
  deleteAccountButton: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  deleteAccountText: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.negative,
    opacity: 0.7,
  },
});
