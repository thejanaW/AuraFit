import React from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import { colors, fonts } from '../../theme';

// Labelled text input with an optional unit suffix (cm / kg / years)
export default function FormField({
  label,
  unit,
  value,
  onChangeText,
  placeholder,
  keyboardType = 'number-pad',
  error = '',
  style,
}) {
  return (
    <View style={[styles.wrap, style]}>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.inputRow, error ? styles.inputRowError : null]}>
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.textFaint}
          keyboardType={keyboardType}
        />
        {unit ? <Text style={styles.unit}>{unit}</Text> : null}
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: 18,
  },
  label: {
    fontFamily: fonts.medium,
    fontSize: 14,
    color: colors.text,
    marginBottom: 8,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    paddingHorizontal: 16,
  },
  inputRowError: {
    borderColor: colors.accent,
  },
  input: {
    flex: 1,
    fontFamily: fonts.regular,
    fontSize: 15,
    color: colors.text,
    paddingVertical: 15,
  },
  unit: {
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.textFaint,
    marginLeft: 8,
  },
  error: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.accent,
    marginTop: 6,
  },
});
