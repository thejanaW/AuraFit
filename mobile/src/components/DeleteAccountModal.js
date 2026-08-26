import React, { useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors, fonts, cardStyle } from '../theme';

// Password re-entry as the confirmation step — a tappable dialog alone is
// too easy to trigger by accident on an irreversible action; requiring the
// current password is the same bar login already uses, no new auth concept.
export default function DeleteAccountModal({ visible, onClose, onConfirm }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  function handleClose() {
    if (submitting) return; // don't let a backdrop tap dismiss mid-request
    setPassword('');
    setError('');
    onClose();
  }

  async function handleConfirm() {
    if (!password) {
      setError('Enter your password to confirm.');
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      await onConfirm(password);
      // On success the caller (ProfileScreen) logs out and navigates away —
      // this modal unmounts with the rest of the authed stack, no need to
      // reset local state here.
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.');
      setSubmitting(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <Pressable style={styles.backdrop} onPress={handleClose}>
        <Pressable style={styles.card} onPress={() => {}}>
          <View style={styles.iconWrap}>
            <Ionicons name="warning-outline" size={26} color={colors.negative} />
          </View>

          <Text style={styles.headline}>Delete your account?</Text>
          <Text style={styles.subtext}>
            This permanently deletes your account and all your data — predictions, habits,
            points, and coupons. This cannot be undone.
          </Text>

          <TextInput
            style={styles.input}
            placeholder="Confirm your password"
            placeholderTextColor={colors.textFaint}
            secureTextEntry
            autoCapitalize="none"
            value={password}
            onChangeText={(text) => {
              setPassword(text);
              if (error) setError('');
            }}
            editable={!submitting}
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={[styles.button, styles.cancelButton]}
              onPress={handleClose}
              disabled={submitting}
              activeOpacity={0.8}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.button, styles.deleteButton]}
              onPress={handleConfirm}
              disabled={submitting}
              activeOpacity={0.8}
            >
              {submitting ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.deleteButtonText}>Delete Account</Text>
              )}
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    ...cardStyle,
    width: '100%',
    maxWidth: 340,
    padding: 24,
    alignItems: 'center',
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255, 90, 95, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  headline: {
    fontFamily: fonts.semibold,
    fontSize: 18,
    color: colors.text,
    marginBottom: 8,
    textAlign: 'center',
  },
  subtext: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: 20,
  },
  input: {
    width: '100%',
    backgroundColor: colors.background,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 13,
    paddingHorizontal: 16,
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.text,
  },
  error: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.negative,
    marginTop: 10,
    textAlign: 'center',
  },
  buttonRow: {
    flexDirection: 'row',
    width: '100%',
    gap: 10,
    marginTop: 20,
  },
  button: {
    flex: 1,
    borderRadius: 999,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 46,
  },
  cancelButton: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cancelButtonText: {
    fontFamily: fonts.semibold,
    fontSize: 14,
    color: colors.text,
  },
  deleteButton: {
    backgroundColor: colors.negative,
  },
  deleteButtonText: {
    fontFamily: fonts.semibold,
    fontSize: 14,
    color: '#fff',
  },
});
