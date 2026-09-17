import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ShieldCheck } from 'lucide-react-native';
import { DS } from '../theme/designSystem';

export default function OTPVerificationScreen({
  phoneNumber = '9876543210',
  countryCode = '+91',
  onEditPhone,
  onVerifySuccess,
}) {
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [activeIdx, setActiveIdx] = useState(0);
  const [timer, setTimer] = useState(45);
  const [loading, setLoading] = useState(false);
  const inputsRef = useRef([]);

  // OTP is validated via SMS provider in production
  const [error, setError] = useState('');

  // 45s Countdown Timer
  useEffect(() => {
    let interval;
    if (timer > 0) {
      interval = setInterval(() => setTimer((t) => t - 1), 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [timer]);

  const handleOtpChange = (text, index) => {
    setError('');
    // Take only the last entered char if multiple entered
    const char = text.slice(-1);
    const newOtp = [...otp];
    newOtp[index] = char;
    setOtp(newOtp);

    // Auto-advance
    if (char && index < 5) {
      inputsRef.current[index + 1]?.focus();
      setActiveIdx(index + 1);
    }

    // Auto-submit on 6th digit
    if (char && index === 5) {
      const fullCode = newOtp.join('');
      if (fullCode.length === 6) {
        submitVerification(fullCode);
      }
    }
  };

  const handleKeyPress = (e, index) => {
    if (e.nativeEvent.key === 'Backspace' && !otp[index] && index > 0) {
      inputsRef.current[index - 1]?.focus();
      setActiveIdx(index - 1);
    }
  };

  const submitVerification = (code) => {
    setError('');
    if (code.length !== 6) {
      setError('Incorrect code. Please check your SMS and try again.');
      return;
    }

    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      onVerifySuccess(code);
    }, 600);
  };

  const handleAutoFillTestOtp = () => {
    const testDigits = ['1', '2', '3', '4', '5', '6'];
    setOtp(testDigits);
    setError('');
    submitVerification(Array(6).fill('0').join('')); // Auto-fill mock for demo
  };

  const handleResend = () => {
    if (timer === 0) {
      setTimer(45);
      setOtp(['', '', '', '', '', '']);
      setError('');
      inputsRef.current[0]?.focus();
      setActiveIdx(0);
    }
  };

  const formattedTime = `00:${timer < 10 ? `0${timer}` : timer}`;
  const maskedPhone = `${countryCode} ${phoneNumber.slice(0, 2)}******${phoneNumber.slice(-2)}`;

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.container}
      >
        <View style={styles.inner}>
          {/* Top Shield Icon */}
          <View style={styles.iconCircle}>
            <ShieldCheck size={36} color={DS.primary.main} />
          </View>

          <Text style={styles.title}>Verification Code</Text>

          {/* Instructional Text with inline Edit link */}
          <View style={styles.instructionWrap}>
            <Text style={styles.instructionText}>
              We sent a 6-digit verification code to{' '}
              <Text style={styles.boldPhone}>{maskedPhone}</Text>
            </Text>
            <TouchableOpacity onPress={onEditPhone} style={styles.editButton}>
              <Text style={styles.editText}>Edit</Text>
            </TouchableOpacity>
          </View>

          {/* Test OTP Helper Banner */}
          {__DEV__ && (
            <TouchableOpacity
              style={styles.testBadge}
              onPress={handleAutoFillTestOtp}
              activeOpacity={0.8}
            >
              <Text style={styles.testBadgeText}>
                🧪 Test Mode: Tap to auto-fill mock OTP
              </Text>
            </TouchableOpacity>
          )}

          {/* 6 Individual Rounded Square Boxes */}
          <View style={styles.otpGrid}>
            {otp.map((digit, index) => {
              const isActive = activeIdx === index;
              return (
                <TextInput
                  key={index}
                  ref={(el) => (inputsRef.current[index] = el)}
                  style={[
                    styles.otpBox,
                    isActive && styles.otpBoxActive,
                    digit ? styles.otpBoxFilled : null,
                    error ? styles.otpBoxError : null,
                  ]}
                  keyboardType="number-pad"
                  maxLength={1}
                  value={digit}
                  onChangeText={(text) => handleOtpChange(text, index)}
                  onKeyPress={(e) => handleKeyPress(e, index)}
                  onFocus={() => {
                    setActiveIdx(index);
                    setError('');
                  }}
                  selectTextOnFocus
                />
              );
            })}
          </View>

          {/* Error Message */}
          {error ? (
            <Text style={styles.errorText}>{error}</Text>
          ) : null}

          {/* Fallback Verify Button */}
          <TouchableOpacity
            style={[
              styles.verifyButton,
              otp.join('').length < 6 && styles.verifyButtonDisabled,
            ]}
            onPress={() => submitVerification(otp.join(''))}
            disabled={loading || otp.join('').length < 6}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.verifyButtonText}>Verify &amp; Continue</Text>
            )}
          </TouchableOpacity>

          {/* Timer Countdown / Resend Link */}
          <View style={styles.resendContainer}>
            {timer > 0 ? (
              <Text style={styles.timerText}>
                Resend OTP in <Text style={styles.timerCountdown}>{formattedTime}</Text>
              </Text>
            ) : (
              <TouchableOpacity onPress={handleResend} activeOpacity={0.7}>
                <Text style={styles.activeResendText}>Didn’t receive code? Resend OTP</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>
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
    alignItems: 'center',
  },
  iconCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: DS.primary.muted,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: DS.spacing.md,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: DS.text.primary,
    marginBottom: DS.spacing.xs,
  },
  instructionWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: DS.spacing.xl,
    paddingHorizontal: DS.spacing.sm,
  },
  instructionText: {
    fontSize: 14,
    color: DS.text.muted,
    textAlign: 'center',
    lineHeight: 20,
  },
  boldPhone: {
    fontWeight: '600',
    color: DS.text.primary,
  },
  editButton: {
    marginLeft: 6,
    paddingVertical: 2,
    paddingHorizontal: 6,
  },
  editText: {
    fontSize: 14,
    fontWeight: '600',
    color: DS.primary.main, // Lavender #8A79B8
    textDecorationLine: 'underline',
  },
  otpGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    maxWidth: 320,
    marginBottom: DS.spacing.xl,
  },
  otpBox: {
    width: 46,
    height: 52,
    backgroundColor: DS.canvas.surface, // #FFFFFF
    borderWidth: 1.5,
    borderColor: DS.canvas.border, // #EBE8F6
    borderRadius: DS.radius.md,
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
    color: DS.text.primary,
  },
  otpBoxActive: {
    borderColor: DS.primary.main, // Lavender #8A79B8
    backgroundColor: DS.canvas.surface,
  },
  otpBoxFilled: {
    borderColor: DS.primary.main,
  },
  verifyButton: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: DS.primary.main,
    height: 52,
    borderRadius: DS.radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    ...DS.shadow.hover,
    marginBottom: DS.spacing.lg,
  },
  verifyButtonDisabled: {
    opacity: 0.55,
  },
  verifyButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: DS.text.light,
  },
  resendContainer: {
    alignItems: 'center',
    paddingVertical: DS.spacing.sm,
  },
  timerText: {
    fontSize: 14,
    color: DS.text.muted,
  },
  timerCountdown: {
    fontWeight: '600',
    color: DS.text.primary,
  },
  activeResendText: {
    fontSize: 14,
    fontWeight: '600',
    color: DS.primary.main,
  },
  testBadge: {
    backgroundColor: '#F0EDF8',
    borderWidth: 1,
    borderColor: '#D4C9EB',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: DS.radius.pill,
    marginBottom: DS.spacing.lg,
  },
  testBadgeText: {
    fontSize: 13,
    color: DS.text.primary,
    fontWeight: '500',
  },
  testBadgeCode: {
    fontWeight: '700',
    color: DS.primary.main,
  },
  otpBoxError: {
    borderColor: DS.accent.sos,
    backgroundColor: DS.accent.sosBg,
  },
  errorText: {
    color: DS.accent.sos,
    fontSize: 13,
    fontWeight: '600',
    marginBottom: DS.spacing.md,
    textAlign: 'center',
  },
});
