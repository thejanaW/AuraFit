import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors, fonts } from '../../theme';

// Row of circular number buttons (min..max) with anchor labels under the
// two ends. Used for sleep quality 1-5 (step 2); reusable for stress level
// and similar scale questions.
export default function NumberScale({
  value,
  onChange,
  min = 1,
  max = 5,
  leftLabel,         // under the first button, e.g. "Restless"
  rightLabel,        // under the last button, e.g. "Deep"
  style,
}) {
  const numbers = [];
  for (let n = min; n <= max; n += 1) numbers.push(n);

  return (
    <View style={style}>
      <View style={styles.row}>
        {numbers.map((n) => {
          const selected = value === n;
          return (
            <TouchableOpacity
              key={n}
              style={[styles.circle, selected && styles.circleSelected]}
              onPress={() => onChange(n)}
            >
              <Text style={[styles.number, selected && styles.numberSelected]}>{n}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      {leftLabel || rightLabel ? (
        <View style={styles.labelRow}>
          <Text style={styles.anchorLabel}>{leftLabel}</Text>
          <Text style={styles.anchorLabel}>{rightLabel}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  circle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  circleSelected: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  number: {
    fontFamily: fonts.semibold,
    fontSize: 17,
    color: colors.textMuted,
  },
  numberSelected: {
    color: colors.text,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  anchorLabel: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.textFaint,
  },
});
