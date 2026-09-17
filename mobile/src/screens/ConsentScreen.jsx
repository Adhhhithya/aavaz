import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Switch } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ShieldCheck, FileKey, EyeOff } from 'lucide-react-native';
import { DS, glassCard } from '../theme/designSystem';

export default function ConsentScreen({ onConsent }) {
  const [agreed, setAgreed] = useState(false);

  return (
    <SafeAreaView style={styles.root}>
      <LinearGradient colors={DS.gradient.background} style={StyleSheet.absoluteFillObject} />
      
      <View style={styles.container}>
        <View style={styles.header}>
          <ShieldCheck size={32} color={DS.accent.emerald} />
          <Text style={styles.title}>Data Protection</Text>
        </View>

        <Text style={styles.body}>This app aligns with the DPDP Act. Your data is encrypted and strictly access-controlled.</Text>

        <View style={[glassCard, styles.tiers]}>
          <View style={styles.tierRow}>
            <EyeOff size={20} color={DS.accent.indigo} />
            <View style={{ flex: 1 }}>
              <Text style={styles.tierTitle}>Tier 1: Redacted View</Text>
              <Text style={styles.tierDesc}>District Dashboards see anonymized stats only.</Text>
            </View>
          </View>
          <View style={styles.divider} />
          <View style={styles.tierRow}>
            <FileKey size={20} color={DS.accent.teal} />
            <View style={{ flex: 1 }}>
              <Text style={styles.tierTitle}>Tier 2: Protected View</Text>
              <Text style={styles.tierDesc}>Only your assigned Counsellor can see case details.</Text>
            </View>
          </View>
        </View>

        <View style={styles.toggleRow}>
          <Switch value={agreed} onValueChange={setAgreed} trackColor={{ true: DS.accent.emerald }} />
          <Text style={styles.toggleText}>I consent to protected telemetry tracking</Text>
        </View>

        <TouchableOpacity style={[styles.cta, !agreed && styles.ctaDisabled]} onPress={onConsent} disabled={!agreed}>
          <LinearGradient colors={agreed ? DS.gradient.cta : ['#334155', '#1e293b']} style={styles.ctaGrad}>
            <Text style={styles.ctaText}>Accept & Enter Dashboard</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: DS.canvas.deep },
  container: { flex: 1, padding: DS.spacing.lg, justifyContent: 'center' },
  header: { alignItems: 'center', marginBottom: DS.spacing.lg },
  title: { ...DS.type.display, marginTop: 10 },
  body: { ...DS.type.body, textAlign: 'center', marginBottom: DS.spacing.xl, lineHeight: 22 },
  
  tiers: { marginBottom: DS.spacing.xl, gap: 16 },
  tierRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  tierTitle: { ...DS.type.label, color: DS.text.primary },
  tierDesc: { ...DS.type.caption, marginTop: 2 },
  divider: { height: 1, backgroundColor: DS.glass.border },

  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: DS.spacing.xl, paddingHorizontal: 10 },
  toggleText: { ...DS.type.body, flex: 1 },

  cta: { borderRadius: 24, overflow: 'hidden' },
  ctaDisabled: { opacity: 0.5 },
  ctaGrad: { paddingVertical: 16, alignItems: 'center' },
  ctaText: { ...DS.type.headline },
});
