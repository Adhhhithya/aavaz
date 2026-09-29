import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  User,
  Shield,
  PhoneCall,
  LogOut,
  Save,
  Globe,
  Phone,
} from 'lucide-react-native';
import { DS } from '../theme/designSystem';
import { useWarningModal } from '../context/WarningModalContext';
import { useLanguage } from '../context/LanguageContext';

export default function ProfileScreen({
  user = {
    name: '',
    phone: '',
    phone_number: '',
    preferred_language: 'en',
    age: '',
    emergencyContact: { name: '', phone: '' },
    emergency_contact_name: '',
    emergency_contact_phone: '',
  },
  onLogout,
  onSaveProfile,
}) {
  const { showWarning } = useWarningModal();
  const { t, lang, setLang, languages } = useLanguage();

  const [name, setName] = useState(user.name || '');
  const [phone, setPhone] = useState(user.phone || user.phone_number || '');
  const [age, setAge] = useState(user.age || '');
  const [emergencyName, setEmergencyName] = useState(
    user.emergencyContact?.name || user.emergency_contact_name || ''
  );
  const [emergencyPhone, setEmergencyPhone] = useState(
    user.emergencyContact?.phone || user.emergency_contact_phone || ''
  );
  const [language, setLanguage] = useState(user.preferred_language || lang || 'en');
  const [isSavedNotice, setIsSavedNotice] = useState(false);

  // Sync state whenever asynchronous user prop updates
  useEffect(() => {
    if (user) {
      if (user.name !== undefined) setName(user.name || '');
      const resolvedPhone = user.phone || user.phone_number || '';
      if (resolvedPhone) setPhone(resolvedPhone);
      if (user.age !== undefined && user.age !== null) setAge(String(user.age || ''));
      const resolvedEmName = user.emergencyContact?.name || user.emergency_contact_name || '';
      if (resolvedEmName) setEmergencyName(resolvedEmName);
      const resolvedEmPhone = user.emergencyContact?.phone || user.emergency_contact_phone || '';
      if (resolvedEmPhone) setEmergencyPhone(resolvedEmPhone);
      if (user.preferred_language) {
        setLanguage(user.preferred_language);
      }
    }
  }, [user]);

  const handleSave = () => {
    if (onSaveProfile) {
      onSaveProfile({
        name,
        phone,
        age,
        preferred_language: language,
        emergencyContact: { name: emergencyName, phone: emergencyPhone },
        emergency_contact_name: emergencyName,
        emergency_contact_phone: emergencyPhone,
      });
    }
    setLang(language);
    setIsSavedNotice(true);
    setTimeout(() => setIsSavedNotice(false), 2500);
  };

  const handleSelectLanguage = (code) => {
    setLanguage(code);
    setLang(code);
  };

  const confirmLogout = () => {
    showWarning({
      title: t('profileSignOutDevice') || 'Sign Out',
      message: t('profileSignOutPrompt') || 'Are you sure you want to sign out?',
      type: 'warning',
      buttonText: t('btnSignOut') || 'Sign Out',
      onConfirm: onLogout,
      secondaryText: t('btnCancel') || 'Cancel',
    });
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.screenTitle}>{t('profileTitle')}</Text>
          <Text style={styles.screenSubtitle}>{t('profileSubtitle')}</Text>
        </View>

        {/* Profile Identity Card */}
        <View style={styles.card}>
          <View style={styles.avatarRow}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {name ? name.slice(0, 2).toUpperCase() : 'PS'}
              </Text>
            </View>
            <View style={styles.avatarMeta}>
              <Text style={styles.userName}>{name || t('welcomeSurvivor')}</Text>
              <Text style={styles.userPhone}>{phone || t('noPhoneRegistered')}</Text>
            </View>
          </View>

          <View style={styles.divider} />

          {/* Form Fields */}
          <View style={styles.inputGroup}>
            <Text style={styles.fieldLabel}>{t('profileDisplayName')}</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="e.g. Ramesh Kumar"
              placeholderTextColor={DS.text.muted}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.fieldLabel}>{t('profilePhoneLabel')}</Text>
            <View style={styles.phoneInputWrapper}>
              <Phone size={16} color={DS.text.muted} style={{ marginRight: 8 }} />
              <TextInput
                style={styles.phoneInput}
                value={phone}
                onChangeText={setPhone}
                placeholder="+91 98765 43210"
                placeholderTextColor={DS.text.muted}
                keyboardType="phone-pad"
              />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.fieldLabel}>{t('profileAge')}</Text>
            <TextInput
              style={styles.input}
              value={age}
              onChangeText={setAge}
              placeholder="e.g. 28"
              placeholderTextColor={DS.text.muted}
              keyboardType="numeric"
            />
          </View>
        </View>

        {/* Emergency SOS Fallback Section */}
        <View style={styles.card}>
          <View style={styles.cardHeaderWithTag}>
            <View style={styles.tag}>
              <PhoneCall size={14} color={DS.accent.sos} style={{ marginRight: 4 }} />
              <Text style={styles.tagText}>{t('profileEmergencyTitle')}</Text>
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.fieldLabel}>{t('profileEmergencyPerson')}</Text>
            <TextInput
              style={styles.input}
              value={emergencyName}
              onChangeText={setEmergencyName}
              placeholder="e.g. Anjali Sharma"
              placeholderTextColor={DS.text.muted}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.fieldLabel}>{t('profileEmergencyPhone')}</Text>
            <TextInput
              style={styles.input}
              value={emergencyPhone}
              onChangeText={setEmergencyPhone}
              placeholder="+91 98765 43210"
              placeholderTextColor={DS.text.muted}
              keyboardType="phone-pad"
            />
          </View>
        </View>

        {/* Multilingual Preference Card */}
        <View style={styles.card}>
          <View style={styles.langHeaderRow}>
            <Globe size={18} color={DS.primary.main} style={{ marginRight: 8 }} />
            <Text style={styles.cardTitle}>{t('languageSelectTitle')}</Text>
          </View>
          <Text style={styles.langSubtitle}>{t('languageSelectDesc')}</Text>

          <View style={styles.langGrid}>
            {languages.map((item) => {
              const isSelected = language === item.code || lang === item.code;
              return (
                <TouchableOpacity
                  key={item.code}
                  style={[styles.langChip, isSelected && styles.langChipSelected]}
                  onPress={() => handleSelectLanguage(item.code)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.langChipText, isSelected && styles.langChipTextSelected]}>
                    {item.nativeName}
                  </Text>
                  <Text style={[styles.langChipSub, isSelected && styles.langChipSubSelected]}>
                    {item.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Confidentiality & Security Card */}
        <View style={styles.card}>
          <View style={styles.privacyRow}>
            <Shield size={20} color={DS.primary.main} style={{ marginRight: 10 }} />
            <View style={{ flex: 1 }}>
              <Text style={styles.privacyTitle}>{t('profilePrivacyTitle')}</Text>
              <Text style={styles.privacyDesc}>{t('profilePrivacyDesc')}</Text>
            </View>
          </View>
        </View>

        {/* Save Changes Button */}
        <TouchableOpacity
          style={styles.saveButton}
          onPress={handleSave}
          activeOpacity={0.85}
        >
          <Save size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
          <Text style={styles.saveButtonText}>
            {isSavedNotice ? t('btnSaved') : t('btnSave')}
          </Text>
        </TouchableOpacity>

        {/* Logout Button */}
        <TouchableOpacity
          style={styles.logoutButton}
          onPress={confirmLogout}
          activeOpacity={0.8}
        >
          <LogOut size={16} color={DS.accent.sos} style={{ marginRight: 6 }} />
          <Text style={styles.logoutButtonText}>{t('profileSignOutDevice')}</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: DS.canvas.base,
  },
  scrollContent: {
    paddingHorizontal: DS.spacing.lg,
    paddingTop: DS.spacing.md,
    paddingBottom: 110,
  },
  header: {
    marginBottom: DS.spacing.lg,
  },
  screenTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: DS.text.primary,
  },
  screenSubtitle: {
    fontSize: 13,
    color: DS.text.muted,
    marginTop: 2,
  },
  card: {
    backgroundColor: DS.canvas.surface,
    borderRadius: DS.radius.xl,
    padding: DS.spacing.lg,
    borderWidth: 1,
    borderColor: DS.canvas.border,
    marginBottom: DS.spacing.md,
    ...DS.shadow.card,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: DS.text.primary,
  },
  avatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: DS.primary.muted,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: DS.spacing.md,
  },
  avatarText: {
    fontSize: 20,
    fontWeight: '700',
    color: DS.primary.main,
  },
  avatarMeta: {
    flex: 1,
  },
  userName: {
    fontSize: 17,
    fontWeight: '700',
    color: DS.text.primary,
  },
  userPhone: {
    fontSize: 13,
    color: DS.text.muted,
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: DS.canvas.border,
    marginVertical: DS.spacing.md,
  },
  inputGroup: {
    marginBottom: DS.spacing.md,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: DS.text.muted,
    marginBottom: 4,
  },
  input: {
    backgroundColor: DS.canvas.surfaceSubtle,
    borderWidth: 1,
    borderColor: DS.canvas.border,
    borderRadius: DS.radius.md,
    paddingHorizontal: DS.spacing.md,
    height: 46,
    fontSize: 14,
    color: DS.text.primary,
  },
  phoneInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: DS.canvas.surfaceSubtle,
    borderWidth: 1,
    borderColor: DS.canvas.border,
    borderRadius: DS.radius.md,
    paddingHorizontal: DS.spacing.md,
    height: 46,
  },
  phoneInput: {
    flex: 1,
    fontSize: 14,
    color: DS.text.primary,
  },
  cardHeaderWithTag: {
    marginBottom: DS.spacing.md,
  },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: DS.accent.sosBg,
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  tagText: {
    fontSize: 11,
    fontWeight: '600',
    color: DS.accent.sos,
  },
  langHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  langSubtitle: {
    fontSize: 12,
    color: DS.text.muted,
    marginBottom: DS.spacing.md,
  },
  langGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  langChip: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: DS.radius.md,
    borderWidth: 1,
    borderColor: DS.canvas.border,
    backgroundColor: DS.canvas.surfaceSubtle,
    alignItems: 'center',
    minWidth: '30%',
    flexGrow: 1,
  },
  langChipSelected: {
    borderColor: DS.primary.main,
    backgroundColor: DS.primary.muted,
  },
  langChipText: {
    fontSize: 13,
    fontWeight: '700',
    color: DS.text.primary,
  },
  langChipTextSelected: {
    color: DS.primary.main,
  },
  langChipSub: {
    fontSize: 10,
    color: DS.text.muted,
    marginTop: 1,
  },
  langChipSubSelected: {
    color: DS.primary.main,
  },
  privacyRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  privacyTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: DS.text.primary,
    marginBottom: 4,
  },
  privacyDesc: {
    fontSize: 12,
    color: DS.text.muted,
    lineHeight: 17,
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: DS.primary.main,
    height: 52,
    borderRadius: DS.radius.pill,
    marginTop: DS.spacing.sm,
    marginBottom: DS.spacing.md,
    ...DS.shadow.hover,
  },
  saveButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: DS.canvas.surface,
    borderWidth: 1,
    borderColor: DS.canvas.border,
    height: 50,
    borderRadius: DS.radius.pill,
  },
  logoutButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: DS.accent.sos,
  },
});
