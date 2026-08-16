import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts } from '../../theme';

// Shared chrome for every onboarding step: top bar (back chevron, progress
// bar, "1/7" counter), "STEP 0X · CATEGORY" label with icon, title, scrollable
// content area, pill Continue button. Steps only supply their fields.
export default function StepScreen({
  stepNumber,       // 1-based
  totalSteps,
  label,            // e.g. "BASICS"
  icon,             // Ionicons name for the step label
  title,
  subtitle,
  onBack,
  onContinue,
  continueDisabled = false,
  continueLabel = 'Continue',
  loading = false,
  error = '',
  onLogout,
  onSkipToDashboard,
  children,
}) {
  const progress = stepNumber / totalSteps;
  const [menuVisible, setMenuVisible] = useState(false);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.backButton} onPress={onBack} hitSlop={12}>
            <Ionicons name="chevron-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
          </View>
          <Text style={styles.stepCounter}>
            {stepNumber}/{totalSteps}
          </Text>
          <TouchableOpacity
            style={styles.skipButton}
            onPress={() => setMenuVisible(true)}
            hitSlop={12}
          >
            <Text style={styles.skipText}>Skip</Text>
          </TouchableOpacity>
        </View>

        <Modal
          visible={menuVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setMenuVisible(false)}
        >
          <TouchableOpacity
            style={styles.modalOverlay}
            activeOpacity={1}
            onPress={() => setMenuVisible(false)}
          >
            <View style={styles.sheet} onStartShouldSetResponder={() => true}>
              <Text style={styles.sheetTitle}>Leave onboarding?</Text>
              <Text style={styles.sheetSubtitle}>
                Your answers so far won't be saved unless you finish.
              </Text>
              <TouchableOpacity
                style={styles.sheetOption}
                onPress={() => {
                  setMenuVisible(false);
                  onSkipToDashboard?.();
                }}
              >
                <Ionicons name="arrow-forward-circle-outline" size={20} color={colors.text} />
                <Text style={styles.sheetOptionText}>Skip to Dashboard</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.sheetOption}
                onPress={() => {
                  setMenuVisible(false);
                  onLogout?.();
                }}
              >
                <Ionicons name="log-out-outline" size={20} color={colors.negative} />
                <Text style={[styles.sheetOptionText, { color: colors.negative }]}>
                  Log out
                </Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.sheetCancel} onPress={() => setMenuVisible(false)}>
                <Text style={styles.sheetCancelText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </Modal>

        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.stepLabelRow}>
            <Ionicons name={icon} size={14} color={colors.accent} />
            <Text style={styles.stepLabel}>
              STEP {String(stepNumber).padStart(2, '0')} · {label}
            </Text>
          </View>
          <Text style={styles.title}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}

          {children}
        </ScrollView>

        <View style={styles.footer}>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <TouchableOpacity
            style={[styles.continueButton, continueDisabled && styles.continueDisabled]}
            onPress={onContinue}
            disabled={continueDisabled || loading}
          >
            {loading ? (
              <ActivityIndicator color={colors.text} />
            ) : (
              <Text style={[styles.continueText, continueDisabled && styles.continueTextDisabled]}>
                {continueLabel}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  flex: {
    flex: 1,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 16,
  },
  backButton: {
    width: 32,
    alignItems: 'flex-start',
  },
  progressTrack: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginHorizontal: 12,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
    backgroundColor: colors.accent,
  },
  stepCounter: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.textMuted,
    minWidth: 32,
    textAlign: 'right',
  },
  skipButton: {
    marginLeft: 14,
  },
  skipText: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.textSecondary,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    borderBottomWidth: 0,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 32,
  },
  sheetTitle: {
    fontFamily: fonts.semibold,
    fontSize: 17,
    color: colors.text,
    marginBottom: 4,
  },
  sheetSubtitle: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.textMuted,
    marginBottom: 20,
  },
  sheetOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  sheetOptionText: {
    fontFamily: fonts.medium,
    fontSize: 15,
    color: colors.text,
  },
  sheetCancel: {
    alignItems: 'center',
    paddingTop: 18,
  },
  sheetCancelText: {
    fontFamily: fonts.medium,
    fontSize: 14,
    color: colors.textMuted,
  },
  content: {
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  stepLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  stepLabel: {
    fontFamily: fonts.semibold,
    fontSize: 12,
    letterSpacing: 1.5,
    color: colors.accent,
  },
  title: {
    fontFamily: fonts.semibold,
    fontSize: 26,
    color: colors.text,
    marginBottom: 6,
  },
  subtitle: {
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.textMuted,
    marginBottom: 24,
  },
  footer: {
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 12,
  },
  error: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.accent,
    textAlign: 'center',
    marginBottom: 10,
  },
  continueButton: {
    backgroundColor: colors.accent,
    borderRadius: 999,
    paddingVertical: 17,
    alignItems: 'center',
  },
  continueDisabled: {
    backgroundColor: colors.disabled,
  },
  continueText: {
    fontFamily: fonts.semibold,
    fontSize: 16,
    color: colors.text,
  },
  continueTextDisabled: {
    color: colors.textFaint,
  },
});
