import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';

import { api } from '../services/api';
import { colors, fonts, cardStyle } from '../theme';
import CouponRewardModal from '../components/CouponRewardModal';

// Public Snazzy Maps-style dark theme JSON for Google Maps, matching the
// app's dark palette instead of the default light basemap.
const DARK_MAP_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#1C1C1E' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#1C1C1E' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#8A8A8E' }] },
  { featureType: 'administrative', elementType: 'geometry', stylers: [{ color: '#2C2C2E' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#2C2C2E' }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#8A8A8E' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0E0E10' }] },
];

function formatDistance(meters) {
  if (meters == null) return '';
  return meters < 1000 ? `${Math.round(meters)} m away` : `${(meters / 1000).toFixed(1)} km away`;
}

// Rewards Map — Chunk 4. Shows every reward_pins row as a marker, distance
// computed server-side via PostGIS from the device's live position. Tapping
// a pin surfaces a claim card; claiming only succeeds within CLAIM_RADIUS
// (enforced server-side, never trusted from distance shown here alone).
export default function MapScreen() {
  const insets = useSafeAreaInsets();
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [position, setPosition] = useState(null);
  const [pins, setPins] = useState([]);
  const [claimRadius, setClaimRadius] = useState(30);
  const [selectedPin, setSelectedPin] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [claiming, setClaiming] = useState(false);
  const [feedback, setFeedback] = useState(null); // { type: 'success'|'error', text } — errors + "already claimed" only now; a fresh success opens rewardModal instead
  // { pointsAwarded, brandName, coupon } — kept in place (not cleared) while
  // the modal closes, so its fade-out animation doesn't flash empty content
  const [rewardModal, setRewardModal] = useState(null);
  const [rewardModalVisible, setRewardModalVisible] = useState(false);

  const loadPins = useCallback(async (coords) => {
    try {
      const res = await api.getRewardPins(coords.latitude, coords.longitude);
      setPins(res.pins);
      setClaimRadius(res.claimRadiusMeters);
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  const refreshLocation = useCallback(async () => {
    setLoading(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setPermissionDenied(true);
        return;
      }
      setPermissionDenied(false);
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      setPosition(loc.coords);
      await loadPins(loc.coords);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [loadPins]);

  useEffect(() => {
    refreshLocation();
  }, [refreshLocation]);

  // Distance drifts as the user walks, so re-check silently on every visit
  // without resetting the map's camera or the loading spinner.
  useFocusEffect(
    useCallback(() => {
      if (position) loadPins(position);
    }, [position, loadPins])
  );

  const handleClaim = useCallback(async () => {
    if (!selectedPin || !position) return;
    setClaiming(true);
    setFeedback(null);
    try {
      const res = await api.claimReward(selectedPin.id, position.latitude, position.longitude);
      if (res.alreadyClaimed) {
        // No new coupon on a repeat/idempotent claim — the backend only
        // picks one on the fresh-claim path (rewards.js), so this stays a
        // plain text note rather than opening the celebration modal.
        setFeedback({ type: 'success', text: 'Already claimed' });
      } else {
        // Fresh claim — replaces the old inline "+N points" toast with the
        // full celebration modal (points + random coupon + confetti).
        setRewardModal({
          pointsAwarded: res.pointsAwarded,
          brandName: res.brandName,
          coupon: res.coupon ?? null,
        });
        setRewardModalVisible(true);
      }
      await loadPins(position);
      setSelectedPin((prev) => (prev ? { ...prev, claimed: true } : prev));
    } catch (err) {
      const distanceMeters = err.data?.distanceMeters;
      setFeedback({
        type: 'error',
        text: distanceMeters != null
          ? `Too far away — ${formatDistance(distanceMeters)}, need to be within ${claimRadius} m`
          : err.message,
      });
    } finally {
      setClaiming(false);
    }
  }, [selectedPin, position, loadPins, claimRadius]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} size="large" />
      </View>
    );
  }

  if (permissionDenied) {
    return (
      <View style={styles.center}>
        <Ionicons name="location-outline" size={32} color={colors.textSecondary} />
        <Text style={styles.permissionText}>
          Location access is needed to find nearby reward pins and verify you're close enough to claim one.
        </Text>
        <TouchableOpacity style={styles.retryButton} onPress={refreshLocation} activeOpacity={0.8}>
          <Text style={styles.retryButtonText}>Grant location access</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.flex}>
      <MapView
        style={styles.flex}
        customMapStyle={DARK_MAP_STYLE}
        showsUserLocation
        showsMyLocationButton={false}
        initialRegion={{
          latitude: position.latitude,
          longitude: position.longitude,
          latitudeDelta: 0.05,
          longitudeDelta: 0.05,
        }}
      >
        {pins.map((pin) => (
          <Marker
            key={pin.id}
            coordinate={{ latitude: pin.lat, longitude: pin.lng }}
            pinColor={pin.claimed ? colors.positive : colors.accent}
            onPress={() => {
              setSelectedPin(pin);
              setFeedback(null);
            }}
          />
        ))}
      </MapView>

      <TouchableOpacity
        style={[styles.refreshFab, { top: insets.top + 12 }]}
        onPress={refreshLocation}
        activeOpacity={0.8}
      >
        <Ionicons name="refresh" size={20} color={colors.text} />
      </TouchableOpacity>

      {error && (
        <View style={[styles.errorBanner, { top: insets.top + 12 }]}>
          <Text style={styles.errorBannerText}>{error}</Text>
        </View>
      )}

      {selectedPin && (
        <View style={[styles.claimCard, { paddingBottom: insets.bottom + 16 }]}>
          <TouchableOpacity style={styles.closeButton} onPress={() => setSelectedPin(null)}>
            <Ionicons name="close" size={18} color={colors.textSecondary} />
          </TouchableOpacity>

          <Text style={styles.brandName}>{selectedPin.brand_name}</Text>
          {selectedPin.description && (
            <Text style={styles.brandDesc}>{selectedPin.description}</Text>
          )}
          <View style={styles.metaRow}>
            <Text style={styles.metaText}>{formatDistance(selectedPin.distance_m)}</Text>
            <Text style={styles.metaPoints}>+{selectedPin.reward_value} pts</Text>
          </View>

          {feedback && (
            <Text
              style={[
                styles.feedbackText,
                feedback.type === 'success' ? styles.feedbackSuccess : styles.feedbackError,
              ]}
            >
              {feedback.text}
            </Text>
          )}

          {selectedPin.claimed ? (
            <View style={styles.claimedBadge}>
              <Ionicons name="checkmark-circle" size={18} color={colors.positive} />
              <Text style={styles.claimedText}>Claimed</Text>
            </View>
          ) : (
            <TouchableOpacity
              style={[styles.claimButton, claiming && styles.claimButtonBusy]}
              onPress={handleClaim}
              disabled={claiming}
              activeOpacity={0.8}
            >
              {claiming ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.claimButtonText}>Claim reward</Text>
              )}
            </TouchableOpacity>
          )}
        </View>
      )}

      <CouponRewardModal
        visible={rewardModalVisible}
        onClose={() => setRewardModalVisible(false)}
        pointsAwarded={rewardModal?.pointsAwarded}
        brandName={rewardModal?.brandName}
        coupon={rewardModal?.coupon}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  permissionText: {
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 12,
    marginBottom: 20,
    lineHeight: 20,
  },
  retryButton: {
    backgroundColor: colors.accent,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  retryButtonText: {
    fontFamily: fonts.semibold,
    fontSize: 14,
    color: '#fff',
  },
  refreshFab: {
    position: 'absolute',
    right: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(28, 28, 30, 0.9)',
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorBanner: {
    position: 'absolute',
    left: 16,
    right: 64,
    backgroundColor: 'rgba(255, 90, 95, 0.15)',
    borderWidth: 1,
    borderColor: colors.negative,
    borderRadius: 12,
    padding: 10,
  },
  errorBannerText: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.negative,
  },
  claimCard: {
    ...cardStyle,
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 12,
    padding: 20,
    borderRadius: 22,
  },
  closeButton: {
    position: 'absolute',
    top: 14,
    right: 14,
    padding: 4,
  },
  brandName: {
    fontFamily: fonts.bold,
    fontSize: 18,
    color: colors.text,
    paddingRight: 24,
  },
  brandDesc: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 4,
    lineHeight: 18,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 14,
  },
  metaText: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.textMuted,
  },
  metaPoints: {
    fontFamily: fonts.semibold,
    fontSize: 15,
    color: colors.accent,
  },
  feedbackText: {
    fontFamily: fonts.regular,
    fontSize: 13,
    marginTop: 12,
    lineHeight: 18,
  },
  feedbackSuccess: {
    color: colors.positive,
  },
  feedbackError: {
    color: colors.negative,
  },
  claimButton: {
    backgroundColor: colors.accent,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
    minHeight: 48,
  },
  claimButtonBusy: {
    opacity: 0.7,
  },
  claimButtonText: {
    fontFamily: fonts.semibold,
    fontSize: 15,
    color: '#fff',
  },
  claimedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
    gap: 6,
  },
  claimedText: {
    fontFamily: fonts.medium,
    fontSize: 14,
    color: colors.positive,
  },
});
