import React from 'react';
import { Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors, fonts } from '../../theme';

// Selectable pill button — used for single-select (gender, sleep quality …)
// and multi-select (exercise types) option groups across all steps.
export default function OptionPill({ label, selected, onPress, style }) {
  return (
    <TouchableOpacity
      style={[styles.pill, selected && styles.pillSelected, style]}
      onPress={onPress}
    >
      <Text style={[styles.label, selected && styles.labelSelected]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  pill: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingVertical: 14,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  pillSelected: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  label: {
    fontFamily: fonts.medium,
    fontSize: 15,
    color: colors.textMuted,
  },
  labelSelected: {
    color: colors.text,
  },
});
