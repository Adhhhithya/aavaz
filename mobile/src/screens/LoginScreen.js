import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  TouchableWithoutFeedback,
  Keyboard,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { HeartHandshake, ShieldCheck, ChevronDown } from 'lucide-react-native';
import { DS } from '../theme/designSystem';

export default function LoginScreen({ onSendOTP }) {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [countryCode, setCountryCode] = useState('+91');
  const [isFocused, setIsFocused] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSend = () => {
    if (phoneNumber.trim().length < 6) return;
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      onSendOTP({ countryCode, phoneNumber: phoneNumber.trim() });
    }, 600);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.container}
        >
          <View style={styles.inner}>
            {/* Branding / Header */}
            <View style={styles.header}>
              <View style={styles.iconCircle}>
                <HeartHandshake size={36} color={DS.primary.main} />
              </View>
              <Text style={styles.headline}>Welcome to a safer space.</Text>
              <Text style={styles.subheadline}>
                Continuous psychological care, support, and legal guidance.
              </Text>
            </View>

            {/* Input Card Container */}
            <View style={styles.formContainer}>
              <Text style={styles.inputLabel}>Mobile Phone Number</Text>
              <View
                style={[
                  styles.phoneInputRow,
                  isFocused && styles.phoneInputRowFocused,
                ]}
              >
                {/* Country Code Selector */}
                <TouchableOpacity style={styles.countryCodeBadge} activeOpacity={0.7}>
                  <Text style={styles.countryCodeText}>{countryCode}</Text>
                  <ChevronDown size={14} color={DS.text.muted} style={{ marginLeft: 2 }} />
                </TouchableOpacity>

                <View style={styles.divider} />

                {/* Phone Number Input */}
                <TextInput
                  style={styles.textInput}
                  placeholder="Enter 10-digit number"
                  placeholderTextColor={DS.text.muted}
                  keyboardType="phone-pad"
                  value={phoneNumber}
                  onChangeText={setPhoneNumber}
                  onFocus={() => setIsFocused(true)}
                  onBlur={() => setIsFocused(false)}
                  maxLength={12}
                />
              </View>

              {/* Pill-shaped Send OTP CTA Button */}
              <TouchableOpacity
                style={[
                  styles.ctaButton,
                  phoneNumber.trim().length < 6 && styles.ctaButtonDisabled,
                ]}
                onPress={handleSend}
                disabled={loading || phoneNumber.trim().length < 6}
                activeOpacity={0.85}
              >
                {loading ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.ctaButtonText}>Send OTP</Text>
                )}
              </TouchableOpacity>

              {/* Confidentiality & Privacy Micro-copy */}
              <View style={styles.privacyNoteWrap}>
                <ShieldCheck size={16} color={DS.text.muted} style={{ marginRight: 6 }} />
                <Text style={styles.privacyNote}>
                  Your data is protected under end-to-end encryption. All communications remain completely strictly confidential.
                </Text>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </TouchableWithoutFeedback>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: DS.canvas.base, // Cloud Mist #F8F9FC
  },
  container: {
    flex: 1,
  },
  inner: {
    flex: 1,
    paddingHorizontal: DS.spacing.xl,
    justifyContent: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: DS.spacing.xxl,
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: DS.primary.muted,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: DS.spacing.lg,
  },
  headline: {
    fontSize: 24,
    fontWeight: '700',
    color: DS.text.primary,
    textAlign: 'center',
    marginBottom: DS.spacing.xs,
  },
  subheadline: {
    fontSize: 14,
    color: DS.text.muted,
    textAlign: 'center',
    paddingHorizontal: DS.spacing.md,
    lineHeight: 20,
  },
  formContainer: {
    width: '100%',
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: DS.text.primary,
    marginBottom: DS.spacing.xs,
  },
  phoneInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: DS.canvas.surface,
    borderWidth: 1.5,
    borderColor: DS.canvas.border, // #EBE8F6
    borderRadius: DS.radius.lg,
    paddingHorizontal: DS.spacing.md,
    height: 56,
    marginBottom: DS.spacing.xl,
  },
  phoneInputRowFocused: {
    borderColor: DS.primary.main, // Lavender #8A79B8 active focus ring
  },
  countryCodeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: DS.spacing.sm,
  },
  countryCodeText: {
    fontSize: 15,
    fontWeight: '600',
    color: DS.text.primary,
  },
  divider: {
    width: 1,
    height: 24,
    backgroundColor: DS.canvas.border,
    marginRight: DS.spacing.sm,
  },
  textInput: {
    flex: 1,
    fontSize: 16,
    color: DS.text.primary,
    height: '100%',
  },
  ctaButton: {
    backgroundColor: DS.primary.main, // #8A79B8
    height: 54,
    borderRadius: DS.radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    ...DS.shadow.hover,
  },
  ctaButtonDisabled: {
    opacity: 0.55,
  },
  ctaButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: DS.text.light, // #FFFFFF
    letterSpacing: 0.2,
  },
  privacyNoteWrap: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: DS.spacing.xl,
    paddingHorizontal: DS.spacing.xs,
  },
  privacyNote: {
    flex: 1,
    fontSize: 12,
    color: DS.text.muted, // #636774
    lineHeight: 17,
  },
});
