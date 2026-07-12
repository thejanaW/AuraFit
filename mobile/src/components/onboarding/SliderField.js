import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Slider from '@react-native-community/slider';
import { colors, fonts } from '../../theme';

// Big centered value readout + horizontal slider with end labels.
// Used for sleep hours (step 2); reusable for water intake, work hours,
// screen time (steps 3 and 5).
export default function SliderField({
  value,
  onValueChange,
  min,
  max,
  step = 1,
  valueLabel,        // small uppercase text under the big number, e.g. "HOURS PER NIGHT"
  minLabel,          // left end of the slider, e.g. "3h"
  maxLabel,          // right end, e.g. "12h"
  style,
}) {
  return (
    <View style={[styles.wrap, style]}>
      <Text style={styles.value}>{value}</Text>
      {valueLabel ? <Text style={styles.valueLabel}>{valueLabel}</Text> : null}

      <View style={styles.sliderRow}>
        <Text style={styles.endLabel}>{minLabel}</Text>
        <Slider
          style={styles.slider}
          minimumValue={min}
          maximumValue={max}
          step={step}
          value={value}
          onValueChange={onValueChange}
          minimumTrackTintColor={colors.accent}
          maximumTrackTintColor={colors.border}
          thumbTintColor={colors.accent}
        />
        <Text style={styles.endLabel}>{maxLabel}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
  },
  value: {
    fontFamily: fonts.bold,
    fontSize: 72,
    color: colors.accent,
    lineHeight: 84,
  },
  valueLabel: {
    fontFamily: fonts.semibold,
    fontSize: 12,
    letterSpacing: 1.5,
    color: colors.textMuted,
    marginTop: 2,
    marginBottom: 20,
  },
  sliderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'stretch',
  },
  slider: {
    flex: 1,
    height: 40,
    marginHorizontal: 8,
  },
  endLabel: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.textFaint,
    minWidth: 28,
    textAlign: 'center',
  },
});
