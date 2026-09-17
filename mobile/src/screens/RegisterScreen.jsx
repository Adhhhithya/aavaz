import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { User, Calendar, PhoneCall, ShieldCheck, Heart } from 'lucide-react-native';
import { DS } from '../theme/designSystem';
import { api } from '../services/api';

export default function RegisterScreen({ phoneNumber, phoneVerifiedToken, onCompleteSetup }) {
  const [fullName, setFullName] = useState('');
  const [age, setAge] = useState('');
  const [emergencyName, setEmergencyName] = useState('');
  const [emergencyPhone, setEmergencyPhone] = useState('');
  const [loading, setLoading] = useState(false);

  const isValid = fullName.trim() && age.trim() && emergencyName.trim() && emergencyPhone.trim();

  const handleSubmit = async () => {
    if (!isValid) return;
    if (!phoneVerifiedToken) {
      alert('Your phone verification has expired. Please start over.');
      return;
    }
    try {
      setLoading(true);
      // S2: phone_number is no longer sent here — the backend derives it from
      // the phone-verified token proving this device just completed OTP
      // verification for that number.
      const data = {
        name: fullName.trim(),
        role_type: 'victim',
        consent_given: true,
        preferred_language: 'en',
        location: { lat: 18.5204, lng: 73.8567 } // Optional location mock
      };

      const res = await api.post('/api/v1/intake/app/register', data, {
        authorization: phoneVerifiedToken,
      });

      onCompleteSetup({
        fullName: fullName.trim(),
        age: age.trim(),
        emergencyContact: {
          name: emergencyName.trim(),
          phone: emergencyPhone.trim(),
        },
        id: res?.user_id || res?.id,
        case_id: res?.case_id,
        token: res?.token,
      });
    } catch (e) {
      alert("Registration failed: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.container}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.iconCircle}>
              <Heart size={32} color={DS.primary.main} />
            </View>
            <Text style={styles.title}>Tell us a bit about you</Text>
            <Text style={styles.subtitle}>
              This helps our system calibrate baseline psychological indicators and ensures your safety net is ready.
            </Text>
          </View>

          {/* Form Card */}
          <View style={styles.card}>
            {/* Full Name */}
            <View style={styles.inputGroup}>
              <View style={styles.labelRow}>
                <User size={16} color={DS.primary.main} style={{ marginRight: 6 }} />
                <Text style={styles.label}>Full / Preferred Display Name</Text>
              </View>
              <TextInput
                style={styles.input}
                placeholder="e.g. Priya Sharma"
                placeholderTextColor={DS.text.muted}
                value={fullName}
                onChangeText={setFullName}
              />
            </View>

            {/* Age / DOB */}
            <View style={styles.inputGroup}>
              <View style={styles.labelRow}>
                <Calendar size={16} color={DS.primary.main} style={{ marginRight: 6 }} />
                <Text style={styles.label}>Age or Date of Birth</Text>
              </View>
              <TextInput
                style={styles.input}
                placeholder="e.g. 26"
                placeholderTextColor={DS.text.muted}
                keyboardType="numeric"
                value={age}
                onChangeText={setAge}
                maxLength={3}
              />
              <Text style={styles.fieldHint}>Used to calibrate emotional distress baselines.</Text>
            </View>

            {/* Divider */}
            <View style={styles.sectionDivider} />

            {/* Emergency Contact Header */}
            <View style={styles.sectionHeader}>
              <View style={styles.emergencyTag}>
                <PhoneCall size={14} color={DS.accent.sos} style={{ marginRight: 4 }} />
                <Text style={styles.emergencyTagText}>Emergency SOS Fallback</Text>
              </View>
              <Text style={styles.sectionTitle}>Emergency Contact Details</Text>
            </View>

            {/* Emergency Contact Name */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Contact Person Name</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. Ramesh Kumar (Brother / Lawyer)"
                placeholderTextColor={DS.text.muted}
                value={emergencyName}
                onChangeText={setEmergencyName}
              />
            </View>

            {/* Emergency Contact Phone */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Emergency Phone Number</Text>
              <TextInput
                style={styles.input}
                placeholder="+91 98765 43210"
                placeholderTextColor={DS.text.muted}
                keyboardType="phone-pad"
                value={emergencyPhone}
                onChangeText={setEmergencyPhone}
              />
              <Text style={styles.fieldHint}>Will receive immediate SMS alerts when SOS is dispatched.</Text>
            </View>
          </View>

          {/* Complete Setup CTA Button */}
          <TouchableOpacity
            style={[styles.submitButton, !isValid && styles.submitButtonDisabled]}
            onPress={handleSubmit}
            disabled={loading || !isValid}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.submitButtonText}>Complete Setup</Text>
            )}
          </TouchableOpacity>

          {/* Privacy Footnote */}
          <View style={styles.privacyNote}>
            <ShieldCheck size={16} color={DS.text.muted} style={{ marginRight: 6 }} />
            <Text style={styles.privacyText}>
              Your information is strictly protected and never shared with third-party advertisers.
            </Text>
          </View>
        </ScrollView>
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
  scrollContent: {
    paddingHorizontal: DS.spacing.lg,
    paddingTop: DS.spacing.md,
    paddingBottom: DS.spacing.xxl,
  },
  header: {
    alignItems: 'center',
    marginBottom: DS.spacing.xl,
    paddingHorizontal: DS.spacing.sm,
  },
  iconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: DS.primary.muted,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: DS.spacing.md,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: DS.text.primary,
    marginBottom: DS.spacing.xs,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: DS.text.muted,
    textAlign: 'center',
    lineHeight: 20,
  },
  card: {
    backgroundColor: DS.canvas.surface,
    borderRadius: DS.radius.xl,
    padding: DS.spacing.xl,
    borderWidth: 1,
    borderColor: DS.canvas.border,
    marginBottom: DS.spacing.xl,
    ...DS.shadow.card,
  },
  inputGroup: {
    marginBottom: DS.spacing.lg,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: DS.spacing.xs,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: DS.text.primary,
    marginBottom: DS.spacing.xs,
  },
  input: {
    backgroundColor: DS.canvas.surfaceSubtle,
    borderWidth: 1,
    borderColor: DS.canvas.border,
    borderRadius: DS.radius.md,
    paddingHorizontal: DS.spacing.md,
    height: 50,
    fontSize: 15,
    color: DS.text.primary,
  },
  fieldHint: {
    fontSize: 11,
    color: DS.text.muted,
    marginTop: 4,
  },
  sectionDivider: {
    height: 1,
    backgroundColor: DS.canvas.border,
    marginVertical: DS.spacing.md,
  },
  sectionHeader: {
    marginBottom: DS.spacing.md,
  },
  emergencyTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: DS.accent.sosBg,
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    marginBottom: 6,
  },
  emergencyTagText: {
    fontSize: 11,
    fontWeight: '600',
    color: DS.accent.sos,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: DS.text.primary,
  },
  submitButton: {
    backgroundColor: DS.primary.main, // #8A79B8
    height: 54,
    borderRadius: DS.radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    ...DS.shadow.hover,
    marginBottom: DS.spacing.lg,
  },
  submitButtonDisabled: {
    opacity: 0.55,
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: DS.text.light,
  },
  privacyNote: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: DS.spacing.md,
  },
  privacyText: {
    fontSize: 12,
    color: DS.text.muted,
    textAlign: 'center',
    lineHeight: 16,
    flex: 1,
  },
});
