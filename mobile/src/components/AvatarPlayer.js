import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useEvent } from 'expo';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Ionicons } from '@expo/vector-icons';

import { colors } from '../theme';

const TIER_0_SOURCE = require('../../assets/avatar/tier0.mp4');
const TIER_1_SOURCE = require('../../assets/avatar/tier1.mp4');
const TIER_2_SOURCE = require('../../assets/avatar/tier2.mp4');

// Points -> tier thresholds. Driven by the user's LIFETIME points total
// (same number as Home's POINTS card — GET /api/points/total, habits +
// reward claims combined), not the health score. Reaching a milestone
// upgrades immediately (>=), not the point after it.
export const AVATAR_TIER_MIN_POINTS = {
  TIER_1: 90, // >=90 total points -> tier 1
  TIER_2: 200, // >=200 total points -> tier 2
};

function tierForPoints(points) {
  if (typeof points !== 'number' || Number.isNaN(points)) return 0;
  if (points >= AVATAR_TIER_MIN_POINTS.TIER_2) return 2;
  if (points >= AVATAR_TIER_MIN_POINTS.TIER_1) return 1;
  return 0;
}

const TIER_SOURCES = [TIER_0_SOURCE, TIER_1_SOURCE, TIER_2_SOURCE];

const SIZE = 200;

// Avatar ring color — deliberately blue, distinct from the app's global
// #FF5A36 orange accent used everywhere else, so the avatar frame reads as
// its own element.
const RING_COLOR = '#3B82F6';
const RING_GLOW = 'rgba(59, 130, 246, 0.28)';

export default function AvatarPlayer({ points, size = SIZE }) {
  const tier = tierForPoints(points);
  const source = TIER_SOURCES[tier];

  const player = useVideoPlayer(source, (p) => {
    p.loop = true;
    p.muted = true;
    p.play();
  });

  // Track the native player's own status ('idle' | 'loading' | 'readyToPlay'
  // | 'error') rather than a manually-managed flag, per expo-video's
  // documented useEvent pattern.
  const { status } = useEvent(player, 'statusChange', { status: player.status });
  const isReady = status === 'readyToPlay';
  const isError = status === 'error';

  return (
    <View style={[styles.ring, { width: size + 12, height: size + 12, borderRadius: (size + 12) / 2 }]}>
      <View
        style={[
          styles.circle,
          { width: size, height: size, borderRadius: size / 2 },
        ]}
      >
        {!isError && (
          <VideoView
            style={StyleSheet.absoluteFill}
            player={player}
            contentFit="cover"
            nativeControls={false}
          />
        )}

        {!isReady && !isError && (
          <View style={styles.overlay}>
            <ActivityIndicator color={RING_COLOR} size="small" />
          </View>
        )}

        {isError && (
          <View style={styles.overlay}>
            <Ionicons name="body-outline" size={size * 0.32} color={RING_COLOR} />
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Colored ring around the circular frame — makes the crop read as an
  // intentional profile-picture bubble rather than a clipping bug.
  ring: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: RING_GLOW,
    borderWidth: 2,
    borderColor: RING_COLOR,
    shadowColor: RING_COLOR,
    shadowOpacity: 0.5,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 0 },
    elevation: 10,
  },
  circle: {
    overflow: 'hidden', // clips the rectangular white-background video into a circle
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
  },
});
