import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors, fonts } from '../../theme';

// Wrapping row of small selectable pill tags — multi-select (several can be
// active at once). Used for exercise types (step 4); reusable for any other
// multi-select field.
export default function TagSelect({ options, selected = [], onToggle, style }) {
  return (
    <View style={[styles.wrap, style]}>
      {options.map((option) => {
        const isSelected = selected.includes(option.key);
        return (
          <TouchableOpacity
            key={option.key}
            style={[styles.tag, isSelected && styles.tagSelected]}
            onPress={() => onToggle(option.key)}
          >
            <Text style={[styles.label, isSelected && styles.labelSelected]}>
              {option.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  tag: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 18,
  },
  tagSelected: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  label: {
    fontFamily: fonts.medium,
    fontSize: 14,
    color: colors.textMuted,
  },
  labelSelected: {
    color: colors.text,
  },
});
