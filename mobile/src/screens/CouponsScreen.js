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

import { api } from '../services/api';
import { colors, fonts, cardStyle } from '../theme';

function formatClaimedDate(iso) {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

// My Coupons — reachable from Profile. Reads GET /api/rewards/coupons
// (claimed_coupons joined to coupons, migration 007) — the full collection,
// not just the one coupon shown right after a claim on the Map tab.
export default function CouponsScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const [coupons, setCoupons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const { coupons: rows } = await api.getClaimedCoupons();
      setCoupons(rows);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load().finally(() => setLoading(false));
    }, [load])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  return (
    <LinearGradient colors={colors.backgroundGradient} style={styles.flex}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 12 }]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />
        }
      >
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()} hitSlop={12}>
            <Ionicons name="chevron-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.topBarTitle}>My Coupons</Text>
          <View style={styles.backButton} />
        </View>

        {loading ? (
          <ActivityIndicator color={colors.accent} size="large" style={styles.spinner} />
        ) : error ? (
          <TouchableOpacity style={styles.errorCard} onPress={onRefresh}>
            <Text style={styles.errorText}>{error}</Text>
            <Text style={styles.errorRetry}>Tap to retry</Text>
          </TouchableOpacity>
        ) : coupons.length === 0 ? (
          <View style={styles.emptyCard}>
            <View style={styles.emptyIconWrap}>
              <Ionicons name="gift-outline" size={28} color={colors.accent} />
            </View>
            <Text style={styles.emptyHeadline}>No coupons yet</Text>
            <Text style={styles.emptySubtext}>
              Claim a reward pin on the Map tab to collect your first one.
            </Text>
          </View>
        ) : (
          coupons.map((coupon, index) => (
            // No stable id from the endpoint's flattened shape (claimedAt
            // isn't guaranteed unique if a pin were ever re-claimable) —
            // brand+claimedAt pair is unique in practice here, index as a
            // last-resort tiebreaker.
            <View key={`${coupon.brand_name}-${coupon.claimedAt}-${index}`} style={styles.couponCard}>
              <View style={styles.couponBadge}>
                <Text style={styles.couponBadgeText}>{coupon.discount_value}</Text>
              </View>
              <View style={styles.couponInfo}>
                <Text style={styles.couponBrand}>{coupon.brand_name}</Text>
                <Text style={styles.couponDesc}>{coupon.description}</Text>
                {coupon.code && <Text style={styles.couponCode}>{coupon.code}</Text>}
                <Text style={styles.couponDate}>Claimed {formatClaimedDate(coupon.claimedAt)}</Text>
              </View>
            </View>
          ))
        )}
      </ScrollView>
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
    marginBottom: 20,
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
  spinner: {
    marginTop: 40,
  },
  errorCard: {
    ...cardStyle,
    borderColor: colors.negative,
    padding: 14,
    alignItems: 'center',
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
  emptyCard: {
    ...cardStyle,
    alignItems: 'center',
    padding: 28,
    marginTop: 8,
  },
  emptyIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255, 90, 54, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyHeadline: {
    fontFamily: fonts.semibold,
    fontSize: 17,
    color: colors.text,
    marginBottom: 6,
  },
  emptySubtext: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 19,
  },
  couponCard: {
    ...cardStyle,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    marginBottom: 12,
  },
  couponBadge: {
    backgroundColor: 'rgba(255, 90, 54, 0.14)',
    borderRadius: 14,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginRight: 14,
    minWidth: 64,
    alignItems: 'center',
  },
  couponBadgeText: {
    fontFamily: fonts.bold,
    fontSize: 14,
    color: colors.accent,
    textAlign: 'center',
  },
  couponInfo: {
    flex: 1,
  },
  couponBrand: {
    fontFamily: fonts.semibold,
    fontSize: 15,
    color: colors.text,
  },
  couponDesc: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 2,
  },
  couponCode: {
    fontFamily: fonts.bold,
    fontSize: 13,
    letterSpacing: 1.5,
    color: colors.text,
    marginTop: 6,
  },
  couponDate: {
    fontFamily: fonts.regular,
    fontSize: 11,
    color: colors.textFaint,
    marginTop: 6,
  },
});
