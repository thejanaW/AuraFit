import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function HabitsScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Daily Habits</Text>
      <Text style={styles.sub}>
        Your personalised habit checklist will appear here once your health score is generated.
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
