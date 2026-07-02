import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function MapScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Rewards Map</Text>
      <Text style={styles.sub}>
        GPS reward pins will appear here. Visit a pin to claim your reward and earn points.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0A',
    padding: 24,
    paddingTop: 60,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 12,
  },
  sub: {
    color: '#666',
    fontSize: 14,
    lineHeight: 22,
  },
});
