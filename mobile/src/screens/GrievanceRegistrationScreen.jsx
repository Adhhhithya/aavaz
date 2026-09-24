import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ArrowLeft,
  ChevronRight,
  ChevronLeft,
  CheckCircle2,
  FileText,
  User,
  MapPin,
  Scale,
  MessageSquare,
  ShieldCheck,
} from 'lucide-react-native';
import { DS } from '../theme/designSystem';
import { api } from '../services/api';
import { useWarningModal } from '../context/WarningModalContext';

const GRIEVANCE_TYPES = [
  'FIR / Police Inaction',
  'Physical Violence / Atrocity',
  'Threats & Intimidation',
  'Land / Property Dispute',
  'Social Boycott / Ostracism',
  'Compensation / Relief Delay',
  'Other Grievance',
];

const CATEGORIES = ['General', 'SC', 'ST', 'OBC'];
const ROLES = [
  { id: 'victim', label: 'Victim / Complainant' },
  { id: 'family', label: 'Family Member' },
  { id: 'witness', label: 'Witness / Representative' },
];

export default function GrievanceRegistrationScreen({ userProfile, onBack, onComplete }) {
  const { showWarning, showError, showSuccess } = useWarningModal();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);

  const [formData, setFormData] = useState({
    grievance_related_to: 'FIR / Police Inaction',
    has_fir: false,
    submitter_role: 'victim',

    first_name: userProfile?.fullName?.split(' ')[0] || userProfile?.name?.split(' ')[0] || '',
    middle_name: '',
    last_name: userProfile?.fullName?.split(' ').slice(1).join(' ') || userProfile?.name?.split(' ').slice(1).join(' ') || '',
    father_name: '',
    dob: '',
    category: 'General',
    nationality: 'Indian',
    aadhaar_number: '',

    pincode: '',
    state: userProfile?.location_state || '',
    district: userProfile?.location_district || '',
    taluka: '',
    full_address: '',

    cnr_number: '',
    grievance_description: '',
  });

  const updateForm = (key, value) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
  };

  const validateStep = () => {
    if (step === 1) {
      if (!formData.grievance_related_to) {
        showWarning({ title: 'Required', message: 'Please select a grievance type.', type: 'warning' });
        return false;
      }
    } else if (step === 2) {
      if (!formData.first_name.trim()) {
        showWarning({ title: 'Required', message: 'First name is required.', type: 'warning' });
        return false;
      }
      if (!formData.aadhaar_number.trim() || formData.aadhaar_number.trim().length < 12) {
        showWarning({ title: 'Required', message: 'Please enter a valid 12-digit Aadhaar number.', type: 'warning' });
        return false;
      }
    } else if (step === 3) {
      if (!formData.state.trim() || !formData.district.trim() || !formData.pincode.trim() || !formData.full_address.trim()) {
        showWarning({ title: 'Required', message: 'Please complete all address fields.', type: 'warning' });
        return false;
      }
    } else if (step === 5) {
      if (!formData.grievance_description.trim() || formData.grievance_description.trim().length < 10) {
        showWarning({ title: 'Required', message: 'Please provide a detailed description of the grievance (at least 10 characters).', type: 'warning' });
        return false;
      }
    }
    return true;
  };

  const handleNext = () => {
    if (validateStep()) {
      setStep((s) => Math.min(s + 1, 5));
    }
  };

  const handlePrev = () => {
    setStep((s) => Math.max(s - 1, 1));
  };

  const handleSubmit = async () => {
    if (!validateStep()) return;

    try {
      setLoading(true);
      const res = await api.post('/api/v1/intake/app/grievance', formData);
      if (res.success || res.case) {
        showSuccess('Grievance registered successfully! Assigned to district authorities.');
        if (onComplete) onComplete(res.case);
      } else {
        showWarning({
          title: 'Registration Failed',
          message: res.message || 'Could not register grievance. Please try again.',
          type: 'warning',
        });
      }
    } catch (e) {
      showError(e, 'Registration Error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onBack} style={styles.backButton} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <ArrowLeft size={22} color={DS.text.primary} />
          </TouchableOpacity>
          <View style={styles.headerTitleContainer}>
            <Text style={styles.headerTitle}>File Grievance</Text>
            <Text style={styles.headerSubtitle}>Step {step} of 5</Text>
          </View>
          <View style={{ width: 40 }} />
        </View>

        {/* Step Progress Bar */}
        <View style={styles.progressBarContainer}>
          {[1, 2, 3, 4, 5].map((i) => (
            <View
              key={i}
              style={[
                styles.progressSegment,
                i <= step ? styles.progressSegmentActive : styles.progressSegmentInactive,
              ]}
            />
          ))}
        </View>

        {/* Step Content */}
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* STEP 1: GRIEVANCE CONTEXT */}
          {step === 1 && (
            <View style={styles.stepContainer}>
              <View style={styles.stepHeader}>
                <FileText size={24} color={DS.primary.main} style={{ marginRight: 8 }} />
                <Text style={styles.stepTitle}>Grievance Context</Text>
              </View>
              <Text style={styles.stepDescription}>
                Select the primary category of your complaint and your role.
              </Text>

              <Text style={styles.fieldLabel}>SUBMITTER ROLE</Text>
              <View style={styles.optionsGrid}>
                {ROLES.map((r) => {
                  const isSelected = formData.submitter_role === r.id;
                  return (
                    <TouchableOpacity
                      key={r.id}
                      style={[styles.optionCard, isSelected && styles.optionCardSelected]}
                      onPress={() => updateForm('submitter_role', r.id)}
                    >
                      <Text style={[styles.optionCardText, isSelected && styles.optionCardTextSelected]}>
                        {r.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={[styles.fieldLabel, { marginTop: 16 }]}>NATURE OF GRIEVANCE</Text>
              <View style={styles.optionsList}>
                {GRIEVANCE_TYPES.map((t) => {
                  const isSelected = formData.grievance_related_to === t;
                  return (
                    <TouchableOpacity
                      key={t}
                      style={[styles.radioItem, isSelected && styles.radioItemSelected]}
                      onPress={() => updateForm('grievance_related_to', t)}
                    >
                      <View style={[styles.radioCircle, isSelected && styles.radioCircleSelected]}>
                        {isSelected && <View style={styles.radioInnerCircle} />}
                      </View>
                      <Text style={[styles.radioText, isSelected && styles.radioTextSelected]}>{t}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}

          {/* STEP 2: PERSONAL IDENTITY */}
          {step === 2 && (
            <View style={styles.stepContainer}>
              <View style={styles.stepHeader}>
                <User size={24} color={DS.primary.main} style={{ marginRight: 8 }} />
                <Text style={styles.stepTitle}>Personal Identity</Text>
              </View>
              <Text style={styles.stepDescription}>
                Provide identity details for official verification and witness protection matching.
              </Text>

              <Text style={styles.fieldLabel}>FIRST NAME *</Text>
              <TextInput
                style={styles.input}
                value={formData.first_name}
                onChangeText={(v) => updateForm('first_name', v)}
                placeholder="e.g. Ramesh"
                placeholderTextColor={DS.text.muted}
              />

              <View style={styles.row}>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <Text style={styles.fieldLabel}>MIDDLE NAME</Text>
                  <TextInput
                    style={styles.input}
                    value={formData.middle_name}
                    onChangeText={(v) => updateForm('middle_name', v)}
                    placeholder="Optional"
                    placeholderTextColor={DS.text.muted}
                  />
                </View>
                <View style={{ flex: 1, marginLeft: 8 }}>
                  <Text style={styles.fieldLabel}>LAST NAME</Text>
                  <TextInput
                    style={styles.input}
                    value={formData.last_name}
                    onChangeText={(v) => updateForm('last_name', v)}
                    placeholder="e.g. Kumar"
                    placeholderTextColor={DS.text.muted}
                  />
                </View>
              </View>

              <Text style={styles.fieldLabel}>FATHER'S / GUARDIAN'S NAME</Text>
              <TextInput
                style={styles.input}
                value={formData.father_name}
                onChangeText={(v) => updateForm('father_name', v)}
                placeholder="Father or Guardian's full name"
                placeholderTextColor={DS.text.muted}
              />

              <Text style={styles.fieldLabel}>DATE OF BIRTH (YYYY-MM-DD)</Text>
              <TextInput
                style={styles.input}
                value={formData.dob}
                onChangeText={(v) => updateForm('dob', v)}
                placeholder="1990-01-15"
                placeholderTextColor={DS.text.muted}
              />

              <Text style={styles.fieldLabel}>COMMUNITY / CATEGORY</Text>
              <View style={styles.pillRow}>
                {CATEGORIES.map((c) => {
                  const isSelected = formData.category === c;
                  return (
                    <TouchableOpacity
                      key={c}
                      style={[styles.categoryPill, isSelected && styles.categoryPillSelected]}
                      onPress={() => updateForm('category', c)}
                    >
                      <Text style={[styles.categoryPillText, isSelected && styles.categoryPillTextSelected]}>
                        {c}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={styles.fieldLabel}>AADHAAR NUMBER *</Text>
              <TextInput
                style={styles.input}
                value={formData.aadhaar_number}
                onChangeText={(v) => updateForm('aadhaar_number', v)}
                placeholder="12-digit Aadhaar number"
                keyboardType="numeric"
                maxLength={12}
                placeholderTextColor={DS.text.muted}
              />
            </View>
          )}

          {/* STEP 3: ADDRESS & JURISDICTION */}
          {step === 3 && (
            <View style={styles.stepContainer}>
              <View style={styles.stepHeader}>
                <MapPin size={24} color={DS.primary.main} style={{ marginRight: 8 }} />
                <Text style={styles.stepTitle}>Residential Address</Text>
              </View>
              <Text style={styles.stepDescription}>
                Used to route this case to the appropriate District Magistrate and local counsellor.
              </Text>

              <Text style={styles.fieldLabel}>STATE *</Text>
              <TextInput
                style={styles.input}
                value={formData.state}
                onChangeText={(v) => updateForm('state', v)}
                placeholder="e.g. Maharashtra"
                placeholderTextColor={DS.text.muted}
              />

              <View style={styles.row}>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <Text style={styles.fieldLabel}>DISTRICT *</Text>
                  <TextInput
                    style={styles.input}
                    value={formData.district}
                    onChangeText={(v) => updateForm('district', v)}
                    placeholder="e.g. Pune"
                    placeholderTextColor={DS.text.muted}
                  />
                </View>
                <View style={{ flex: 1, marginLeft: 8 }}>
                  <Text style={styles.fieldLabel}>TALUKA / TEHSIL</Text>
                  <TextInput
                    style={styles.input}
                    value={formData.taluka}
                    onChangeText={(v) => updateForm('taluka', v)}
                    placeholder="e.g. Haveli"
                    placeholderTextColor={DS.text.muted}
                  />
                </View>
              </View>

              <Text style={styles.fieldLabel}>PINCODE *</Text>
              <TextInput
                style={styles.input}
                value={formData.pincode}
                onChangeText={(v) => updateForm('pincode', v)}
                placeholder="e.g. 411001"
                keyboardType="numeric"
                maxLength={6}
                placeholderTextColor={DS.text.muted}
              />

              <Text style={styles.fieldLabel}>FULL RESIDENTIAL ADDRESS *</Text>
              <TextInput
                style={[styles.input, styles.textAreaSmall]}
                value={formData.full_address}
                onChangeText={(v) => updateForm('full_address', v)}
                placeholder="House/Plot No, Street, Landmark"
                multiline
                numberOfLines={3}
                placeholderTextColor={DS.text.muted}
              />
            </View>
          )}

          {/* STEP 4: LEGAL & COURT DETAILS */}
          {step === 4 && (
            <View style={styles.stepContainer}>
              <View style={styles.stepHeader}>
                <Scale size={24} color={DS.primary.main} style={{ marginRight: 8 }} />
                <Text style={styles.stepTitle}>Legal References</Text>
              </View>
              <Text style={styles.stepDescription}>
                Link police FIR and eCourts details if available.
              </Text>

              <View style={styles.switchRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.switchTitle}>FIR Registered?</Text>
                  <Text style={styles.switchSubtitle}>Has a First Information Report been lodged?</Text>
                </View>
                <Switch
                  value={formData.has_fir}
                  onValueChange={(v) => updateForm('has_fir', v)}
                  trackColor={{ false: DS.canvas.border, true: DS.primary.main }}
                  thumbColor="#FFFFFF"
                />
              </View>

              <Text style={[styles.fieldLabel, { marginTop: 20 }]}>eCOURTS CNR NUMBER (OPTIONAL)</Text>
              <TextInput
                style={styles.input}
                value={formData.cnr_number}
                onChangeText={(v) => updateForm('cnr_number', v.toUpperCase())}
                placeholder="16-character alphanumeric CNR (e.g. MHP0010023452024)"
                autoCapitalize="characters"
                placeholderTextColor={DS.text.muted}
              />
              <Text style={styles.fieldHelper}>
                If entered, our system will automatically pull hearing dates and judge orders.
              </Text>
            </View>
          )}

          {/* STEP 5: INCIDENT STATEMENT */}
          {step === 5 && (
            <View style={styles.stepContainer}>
              <View style={styles.stepHeader}>
                <MessageSquare size={24} color={DS.primary.main} style={{ marginRight: 8 }} />
                <Text style={styles.stepTitle}>Incident Statement</Text>
              </View>
              <Text style={styles.stepDescription}>
                Describe what happened in detail. Our AI will analyze emotional tone to calibrate support.
              </Text>

              <Text style={styles.fieldLabel}>DETAILED STATEMENT *</Text>
              <TextInput
                style={[styles.input, styles.textAreaLarge]}
                value={formData.grievance_description}
                onChangeText={(v) => updateForm('grievance_description', v)}
                placeholder="Please describe the incident, dates, persons involved, threats received, or delays in rehabilitation..."
                multiline
                numberOfLines={8}
                textAlignVertical="top"
                placeholderTextColor={DS.text.muted}
              />

              <View style={styles.securityNotice}>
                <ShieldCheck size={18} color={DS.accent.sage} style={{ marginRight: 8 }} />
                <Text style={styles.securityNoticeText}>
                  Your statement is encrypted and compliant with National Protection protocols.
                </Text>
              </View>
            </View>
          )}
        </ScrollView>

        {/* Footer Navigation */}
        <View style={styles.footer}>
          {step > 1 ? (
            <TouchableOpacity onPress={handlePrev} style={styles.prevButton} disabled={loading}>
              <ChevronLeft size={20} color={DS.text.primary} />
              <Text style={styles.prevButtonText}>Back</Text>
            </TouchableOpacity>
          ) : (
            <View style={{ flex: 1 }} />
          )}

          {step < 5 ? (
            <TouchableOpacity onPress={handleNext} style={styles.nextButton}>
              <Text style={styles.nextButtonText}>Next</Text>
              <ChevronRight size={20} color="#FFFFFF" />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity onPress={handleSubmit} style={styles.submitButton} disabled={loading}>
              {loading ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <Text style={styles.submitButtonText}>Submit Grievance</Text>
                  <CheckCircle2 size={18} color="#FFFFFF" style={{ marginLeft: 6 }} />
                </>
              )}
            </TouchableOpacity>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: DS.canvas.base,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: DS.canvas.border,
    backgroundColor: '#FFFFFF',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: DS.canvas.surfaceSubtle,
  },
  headerTitleContainer: {
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: DS.text.primary,
  },
  headerSubtitle: {
    fontSize: 12,
    fontWeight: '500',
    color: DS.text.muted,
    marginTop: 2,
  },
  progressBarContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#FFFFFF',
    gap: 6,
  },
  progressSegment: {
    flex: 1,
    height: 4,
    borderRadius: 2,
  },
  progressSegmentActive: {
    backgroundColor: DS.primary.main,
  },
  progressSegmentInactive: {
    backgroundColor: DS.canvas.border,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  stepContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 2,
  },
  stepHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  stepTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: DS.text.primary,
  },
  stepDescription: {
    fontSize: 13,
    color: DS.text.muted,
    marginBottom: 20,
    lineHeight: 18,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: DS.text.secondary,
    letterSpacing: 0.8,
    marginBottom: 8,
    marginTop: 12,
  },
  fieldHelper: {
    fontSize: 12,
    color: DS.text.muted,
    marginTop: 6,
    lineHeight: 16,
  },
  input: {
    backgroundColor: DS.canvas.surfaceSubtle,
    borderWidth: 1,
    borderColor: DS.canvas.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: DS.text.primary,
  },
  textAreaSmall: {
    height: 80,
    textAlignVertical: 'top',
  },
  textAreaLarge: {
    height: 160,
  },
  row: {
    flexDirection: 'row',
  },
  optionsGrid: {
    flexDirection: 'row',
    gap: 8,
  },
  optionCard: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: DS.canvas.border,
    backgroundColor: DS.canvas.surfaceSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionCardSelected: {
    borderColor: DS.primary.main,
    backgroundColor: 'rgba(138, 121, 184, 0.12)',
  },
  optionCardText: {
    fontSize: 12,
    fontWeight: '600',
    color: DS.text.secondary,
    textAlign: 'center',
  },
  optionCardTextSelected: {
    color: DS.primary.main,
    fontWeight: '700',
  },
  optionsList: {
    gap: 8,
  },
  radioItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: DS.canvas.border,
    backgroundColor: DS.canvas.surfaceSubtle,
  },
  radioItemSelected: {
    borderColor: DS.primary.main,
    backgroundColor: 'rgba(138, 121, 184, 0.08)',
  },
  radioCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: DS.text.muted,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  radioCircleSelected: {
    borderColor: DS.primary.main,
  },
  radioInnerCircle: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: DS.primary.main,
  },
  radioText: {
    fontSize: 14,
    fontWeight: '500',
    color: DS.text.primary,
    flex: 1,
  },
  radioTextSelected: {
    fontWeight: '700',
    color: DS.primary.main,
  },
  pillRow: {
    flexDirection: 'row',
    gap: 8,
  },
  categoryPill: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: DS.canvas.border,
    backgroundColor: DS.canvas.surfaceSubtle,
    alignItems: 'center',
  },
  categoryPillSelected: {
    borderColor: DS.primary.main,
    backgroundColor: DS.primary.main,
  },
  categoryPillText: {
    fontSize: 13,
    fontWeight: '600',
    color: DS.text.secondary,
  },
  categoryPillTextSelected: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  switchTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: DS.text.primary,
  },
  switchSubtitle: {
    fontSize: 12,
    color: DS.text.muted,
    marginTop: 2,
  },
  securityNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 20,
    padding: 12,
    backgroundColor: 'rgba(104, 176, 135, 0.12)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(104, 176, 135, 0.25)',
  },
  securityNoticeText: {
    fontSize: 12,
    color: DS.text.secondary,
    flex: 1,
    lineHeight: 16,
    fontWeight: '500',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#FFFFFF',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: DS.canvas.border,
    gap: 12,
  },
  prevButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: DS.canvas.border,
    backgroundColor: DS.canvas.surfaceSubtle,
  },
  prevButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: DS.text.primary,
    marginLeft: 4,
  },
  nextButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: DS.primary.main,
  },
  nextButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
    marginRight: 4,
  },
  submitButton: {
    flex: 1.5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: DS.accent.sage,
  },
  submitButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
