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
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { HeartHandshake, ShieldCheck, ChevronDown, Globe } from 'lucide-react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { DS } from '../theme/designSystem';
import HapticButton from '../components/HapticButton';
import ScalePressable from '../components/ScalePressable';
import { useLanguage } from '../context/LanguageContext';
import { LANGUAGES } from '../i18n/translations';

export default function LoginScreen({ onSendOTP }) {
  const { language, changeLanguage, t } = useLanguage();
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
          {/* Language Selector Bar */}
          <View style={styles.langSelectorWrap}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.langScroll}>
              <View style={styles.langIconBadge}>
                <Globe size={14} color={DS.primary.main} />
              </View>
              {LANGUAGES.map((item) => {
                const isSelected = language === item.code;
                return (
                  <TouchableOpacity
                    key={item.code}
                    onPress={() => changeLanguage(item.code)}
                    style={[styles.langChip, isSelected && styles.langChipActive]}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.langChipText, isSelected && styles.langChipTextActive]}>
                      {item.nativeName}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          <View style={styles.inner}>
            
            {/* Branding / Header */}
            <Animated.View entering={FadeInDown.duration(600).springify()} style={styles.header}>
              <View style={styles.iconCircle}>
                <HeartHandshake size={36} color={DS.primary.main} />
              </View>
              <Text style={styles.headline}>{t('mobileWelcomeHeadline')}</Text>
              <Text style={styles.subheadline}>
                {t('mobileWelcomeSub')}
              </Text>
            </Animated.View>

            {/* Input Card Container */}
            <Animated.View entering={FadeInDown.duration(600).delay(100).springify()} style={styles.formContainer}>
              <Text style={styles.inputLabel}>{t('mobilePhoneLabel')}</Text>
              <View
                style={[
                  styles.phoneInputRow,
                  isFocused && styles.phoneInputRowFocused,
                ]}
              >
                {/* Country Code Selector */}
                <ScalePressable style={styles.countryCodeBadge}>
                  <Text style={styles.countryCodeText}>{countryCode}</Text>
                  <ChevronDown size={14} color={DS.text.muted} style={{ marginLeft: 2 }} />
                </ScalePressable>

                <View style={styles.divider} />

                {/* Phone Number Input */}
                <TextInput
                  style={styles.textInput}
                  placeholder={t('mobilePhonePlaceholder')}
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
              <HapticButton
                title={loading ? t('btnSendingOtp') : t('btnSendOtp')}
                disabled={loading || phoneNumber.trim().length < 6}
                onPress={handleSend}
                variant="primary"
                style={styles.ctaButton}
              />

              {/* Confidentiality & Privacy Micro-copy */}
              <Animated.View entering={FadeInDown.duration(600).delay(200).springify()} style={styles.privacyNoteWrap}>
                <ShieldCheck size={16} color={DS.text.muted} style={{ marginRight: 6 }} />
                <Text style={styles.privacyNote}>
                  {t('mobileEncryptionNote')}
                </Text>
              </Animated.View>
            </Animated.View>
          </View>
        </KeyboardAvoidingView>
      </TouchableWithoutFeedback>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: DS.canvas.base,
  },
  langSelectorWrap: {
    paddingVertical: DS.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: DS.canvas.border,
    backgroundColor: DS.canvas.surface,
  },
  langScroll: {
    paddingHorizontal: DS.spacing.md,
    alignItems: 'center',
    gap: 6,
  },
  langIconBadge: {
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: DS.primary.muted,
    marginRight: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  langChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: DS.radius.pill,
    backgroundColor: DS.canvas.base,
    borderWidth: 1,
    borderColor: DS.canvas.border,
  },
  langChipActive: {
    backgroundColor: DS.primary.main,
    borderColor: DS.primary.main,
  },
  langChipText: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
    color: DS.text.secondary,
  },
  langChipTextActive: {
    color: '#ffffff',
    fontFamily: 'Inter-Bold',
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
    fontFamily: 'Inter-Bold',
    color: DS.text.primary,
    textAlign: 'center',
    marginBottom: DS.spacing.xs,
  },
  subheadline: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
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
    fontFamily: 'Inter-Bold',
    color: DS.text.primary,
    marginBottom: DS.spacing.xs,
  },
  phoneInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: DS.canvas.surface,
    borderWidth: 1.5,
    borderColor: DS.canvas.border,
    borderRadius: DS.radius.lg,
    paddingHorizontal: DS.spacing.md,
    height: 56,
    marginBottom: DS.spacing.xl,
  },
  phoneInputRowFocused: {
    borderColor: DS.primary.main,
  },
  countryCodeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: DS.spacing.sm,
  },
  countryCodeText: {
    fontSize: 15,
    fontFamily: 'Inter-Bold',
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
    fontFamily: 'Inter-Medium',
    color: DS.text.primary,
    height: '100%',
  },
  ctaButton: {
    width: '100%',
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
    fontFamily: 'Inter-Medium',
    color: DS.text.muted,
    lineHeight: 17,
  },
});
