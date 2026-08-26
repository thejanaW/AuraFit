import React, { useEffect, useRef } from 'react';
import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import LottieView from 'lottie-react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors, fonts, cardStyle } from '../theme';

// How long the modal stays up before auto-closing if the user doesn't
// dismiss it themselves — long enough to read the coupon, short enough not
// to block the map. The confetti burst itself is ~2s (see confetti.json).
const AUTO_CLOSE_MS = 6000;

// Celebratory popup shown after a successful (non-duplicate) reward claim —
// replaces the old inline "+N points" text in MapScreen's claim card.
// `coupon` is the random reward from GET.../claim's response (migration 007);
// null is handled gracefully (e.g. coupons table not seeded yet) by just
// hiding that section rather than showing a broken card.
export default function CouponRewardModal({ visible, onClose, pointsAwarded, brandName, coupon }) {
  const timerRef = useRef(null);

  useEffect(() => {
    if (!visible) return undefined;
    timerRef.current = setTimeout(onClose, AUTO_CLOSE_MS);
    return () => clearTimeout(timerRef.current);
  }, [visible, onClose]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        {/* Confetti plays once, full-bleed behind the card — Pressable's
            child stopPropagation isn't needed here since the card below has
            its own Pressable that swallows the touch instead */}
        <LottieView
          source={require('../../assets/lottie/confetti.json')}
          autoPlay
          loop={false}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
        />

        {/* onPress no-op stops the backdrop's dismiss-on-tap from firing when
            the touch lands inside the card — only one Pressable in a nested
            stack claims the responder, so this is enough to block bubbling */}
        <Pressable style={styles.card} onPress={() => {}}>
          <TouchableOpacity style={styles.closeButton} onPress={onClose} hitSlop={12}>
            <Ionicons name="close" size={20} color={colors.textSecondary} />
          </TouchableOpacity>

          {coupon ? (
            // Coupon is the hero — it's a fixed, location-specific reward
            // (see rewards.js/migration 007), so it's worth revealing big.
            // Points drop to a small secondary line underneath.
            <>
              <View style={styles.pointsIconWrap}>
                <Ionicons name="gift" size={30} color={colors.accent} />
              </View>
              <Text style={styles.headline}>Coupon unlocked!</Text>

              <View style={styles.couponCard}>
                <Text style={styles.couponDiscount}>{coupon.discount_value}</Text>
                <Text style={styles.couponBrand}>{coupon.brand_name}</Text>
                <Text style={styles.couponDesc}>{coupon.description}</Text>
                {coupon.code && (
                  <View style={styles.codeBox}>
                    <Text style={styles.codeText}>{coupon.code}</Text>
                  </View>
                )}
                <View style={styles.redeemBadge}>
                  <Text style={styles.redeemBadgeText}>Show this code in store to redeem</Text>
                </View>
              </View>

              <Text style={styles.pointsSmall}>+{pointsAwarded} points earned</Text>
            </>
          ) : (
            // Fallback for a pin with no coupon row yet (e.g. migration 007
            // not pasted in, or a pin added later without one seeded) — points
            // stay the primary content so the modal is never empty.
            <>
              <View style={styles.pointsIconWrap}>
                <Ionicons name="trophy" size={30} color={colors.accent} />
              </View>
              <Text style={styles.headline}>Reward claimed!</Text>
              <Text style={styles.pointsText}>
                +{pointsAwarded} <Text style={styles.pointsUnit}>points</Text>
              </Text>
              {brandName && <Text style={styles.subtext}>from {brandName}</Text>}
            </>
          )}

          <TouchableOpacity style={styles.doneButton} onPress={onClose} activeOpacity={0.8}>
            <Text style={styles.doneButtonText}>Nice!</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    ...cardStyle,
    width: '100%',
    maxWidth: 340,
    padding: 24,
    alignItems: 'center',
  },
  closeButton: {
    position: 'absolute',
    top: 14,
    right: 14,
    padding: 4,
  },
  pointsIconWrap: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(255, 90, 54, 0.14)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
    marginTop: 6,
  },
  headline: {
    fontFamily: fonts.semibold,
    fontSize: 18,
    color: colors.text,
    marginBottom: 6,
  },
  pointsText: {
    fontFamily: fonts.bold,
    fontSize: 32,
    color: colors.accent,
  },
  pointsUnit: {
    fontFamily: fonts.medium,
    fontSize: 15,
    color: colors.textMuted,
  },
  subtext: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 2,
  },
  couponCard: {
    width: '100%',
    backgroundColor: colors.background,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.accent,
    borderStyle: 'dashed',
    padding: 20,
    alignItems: 'center',
    marginTop: 14,
  },
  couponDiscount: {
    fontFamily: fonts.bold,
    fontSize: 36,
    color: colors.accent,
    marginBottom: 6,
  },
  couponBrand: {
    fontFamily: fonts.semibold,
    fontSize: 16,
    color: colors.text,
    textAlign: 'center',
  },
  couponDesc: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 18,
  },
  codeBox: {
    backgroundColor: colors.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 10,
    paddingHorizontal: 18,
    marginTop: 14,
  },
  codeText: {
    fontFamily: fonts.bold,
    fontSize: 17,
    letterSpacing: 2,
    color: colors.text,
  },
  redeemBadge: {
    backgroundColor: colors.card,
    borderRadius: 999,
    paddingVertical: 5,
    paddingHorizontal: 12,
    marginTop: 12,
  },
  redeemBadgeText: {
    fontFamily: fonts.medium,
    fontSize: 11,
    letterSpacing: 0.5,
    color: colors.textMuted,
  },
  pointsSmall: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 16,
  },
  doneButton: {
    backgroundColor: colors.accent,
    borderRadius: 999,
    paddingVertical: 13,
    paddingHorizontal: 40,
    marginTop: 22,
    alignItems: 'center',
  },
  doneButtonText: {
    fontFamily: fonts.semibold,
    fontSize: 15,
    color: '#fff',
  },
});
