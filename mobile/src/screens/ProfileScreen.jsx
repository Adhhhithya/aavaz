import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  User,
  Shield,
  PhoneCall,
  Lock,
  LogOut,
  Save,
  Bell,
  HeartPulse,
} from 'lucide-react-native';
import { DS } from '../theme/designSystem';

export default function ProfileScreen({
  user = {
    name: '',
    phone: '',
    age: '',
    emergencyContact: {
      name: '',
      phone: '',
    },
  },
  onLogout,
  onSaveProfile,
}) {
  const [name, setName] = useState(user.name || '');
  const [age, setAge] = useState(user.age || '');
  const [emergencyName, setEmergencyName] = useState(
    user.emergencyContact?.name || ''
  );
  const [emergencyPhone, setEmergencyPhone] = useState(
    user.emergencyContact?.phone || ''
  );
  const [isSavedNotice, setIsSavedNotice] = useState(false);

  const handleSave = () => {
    if (onSaveProfile) {
      onSaveProfile({
        name,
        age,
        emergencyContact: { name: emergencyName, phone: emergencyPhone },
      });
    }
    setIsSavedNotice(true);
    setTimeout(() => setIsSavedNotice(false), 2500);
  };

  const confirmLogout = () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out? You will need to enter your phone number to sign in again.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign Out', style: 'destructive', onPress: onLogout },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.screenTitle}>Profile &amp; Settings</Text>
          <Text style={styles.screenSubtitle}>
            Personal baseline indicators and emergency safety network
          </Text>
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
              <Text style={styles.userName}>{name}</Text>
              <Text style={styles.userPhone}>{user.phone || '+91 98765 43210'}</Text>
            </View>
          </View>

          <View style={styles.divider} />

          {/* Form Fields */}
          <View style={styles.inputGroup}>
            <Text style={styles.fieldLabel}>Display Name</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.fieldLabel}>Age (Baseline Calibration)</Text>
            <TextInput
              style={styles.input}
              value={age}
              onChangeText={setAge}
              keyboardType="numeric"
            />
          </View>
        </View>

        {/* Emergency SOS Fallback Section */}
        <View style={styles.card}>
          <View style={styles.cardHeaderWithTag}>
            <View style={styles.tag}>
              <PhoneCall size={14} color={DS.accent.sos} style={{ marginRight: 4 }} />
              <Text style={styles.tagText}>SOS Emergency Contact</Text>
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.fieldLabel}>Designated Contact Person</Text>
            <TextInput
              style={styles.input}
              value={emergencyName}
              onChangeText={setEmergencyName}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.fieldLabel}>Contact Phone Number</Text>
            <TextInput
              style={styles.input}
              value={emergencyPhone}
              onChangeText={setEmergencyPhone}
              keyboardType="phone-pad"
            />
          </View>
        </View>

        {/* Confidentiality & Security Card */}
        <View style={styles.card}>
          <View style={styles.privacyRow}>
            <Shield size={20} color={DS.primary.main} style={{ marginRight: 10 }} />
            <View style={{ flex: 1 }}>
              <Text style={styles.privacyTitle}>SC/ST Act Privacy Shield</Text>
              <Text style={styles.privacyDesc}>
                All voice recordings, messages, and incident disclosures are stored with multi-tenant AES-256 encryption.
              </Text>
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
            {isSavedNotice ? 'Changes Saved!' : 'Save Profile Changes'}
          </Text>
        </TouchableOpacity>

        {/* Logout Button */}
        <TouchableOpacity
          style={styles.logoutButton}
          onPress={confirmLogout}
          activeOpacity={0.8}
        >
          <LogOut size={16} color={DS.accent.sos} style={{ marginRight: 6 }} />
          <Text style={styles.logoutButtonText}>Sign Out from Device</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: DS.canvas.base, // Cloud Mist #F8F9FC
  },
  scrollContent: {
    paddingHorizontal: DS.spacing.lg,
    paddingTop: DS.spacing.md,
    paddingBottom: 110, // space for ribbon tab bar
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
