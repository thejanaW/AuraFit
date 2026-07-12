import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors, fonts } from '../../theme';

// Compact question row: label on the left, Yes/No pill pair on the right.
// value is true, false, or undefined (unanswered — neither pill highlighted).
export default function YesNoToggle({ label, value, onChange, style }) {
  return (
    <View style={[styles.row, style]}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.pills}>
        <TouchableOpacity
          style={[styles.pill, value === true && styles.pillSelected]}
          onPress={() => onChange(true)}
        >
          <Text style={[styles.pillText, value === true && styles.pillTextSelected]}>Yes</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.pill, value === false && styles.pillSelected]}
          onPress={() => onChange(false)}
        >
          <Text style={[styles.pillText, value === false && styles.pillTextSelected]}>No</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 18,
  },
  label: {
    flex: 1,
    fontFamily: fonts.medium,
    fontSize: 14,
    color: colors.text,
    marginRight: 12,
    lineHeight: 20,
  },
  pills: {
    flexDirection: 'row',
    gap: 8,
  },
  pill: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 18,
  },
  pillSelected: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  pillText: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.textMuted,
  },
  pillTextSelected: {
    color: colors.text,
  },
});
