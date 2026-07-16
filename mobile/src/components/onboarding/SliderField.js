import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Slider from '@react-native-community/slider';
import { colors, fonts } from '../../theme';

// Big centered value readout + horizontal slider with end labels.
// Used for sleep hours (step 2); reusable for water intake, work hours,
// screen time (steps 3 and 5).
//
// Supports an explicit "unanswered" state: when `value` is undefined the
// readout shows a dash and the track/thumb render greyed-out with no filled
// position, so a required answer (e.g. step 7 general health) is never
// silently pre-filled — the answer only exists once the user touches the
// slider. Callers that pass a defined value behave exactly as before.
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
  const answered = value !== undefined && value !== null;

  return (
    <View style={[styles.wrap, style]}>
      <Text style={[styles.value, !answered && styles.valueUnanswered]}>
        {answered ? value : '—'}
      </Text>
      {valueLabel ? <Text style={styles.valueLabel}>{valueLabel}</Text> : null}

      <View style={styles.sliderRow}>
        <Text style={styles.endLabel}>{minLabel}</Text>
        <Slider
          style={styles.slider}
          minimumValue={min}
          maximumValue={max}
          step={step}
          // Unanswered: park the (grey) thumb mid-track purely as a neutral
          // starting position — no answer is recorded until a gesture ends
          value={answered ? value : (min + max) / 2}
          onValueChange={answered ? onValueChange : undefined}
          // Fires on release even when the thumb wasn't dragged, so tapping
          // the middle to confirm a mid-scale answer still counts as touched
          onSlidingComplete={onValueChange}
          minimumTrackTintColor={answered ? colors.accent : colors.border}
          maximumTrackTintColor={colors.border}
          thumbTintColor={answered ? colors.accent : colors.disabled}
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
  valueUnanswered: {
    color: colors.disabled,
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
