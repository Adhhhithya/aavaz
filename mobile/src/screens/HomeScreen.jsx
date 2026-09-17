import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ShieldAlert,
  Wind,
  CheckCircle2,
  Sparkles,
} from 'lucide-react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

import { DS } from '../theme/designSystem';
import DistressGauge from '../components/DistressGauge';
import SOSModal from '../components/SOSModal';
import { api } from '../services/api';

const MOODS = [
  { id: 'calm', label: 'Calm', emoji: '😌', color: DS.accent.sage },
  { id: 'content', label: 'Content', emoji: '🙂', color: '#7EB693' },
  { id: 'neutral', label: 'Neutral', emoji: '😐', color: DS.accent.amber },
  { id: 'anxious', label: 'Anxious', emoji: '😟', color: '#E89269' },
  { id: 'distressed', label: 'Distressed', emoji: '😣', color: DS.accent.terracotta },
];

function ScalePressable({ children, onPress, style, disabled }) {
  const scale = useSharedValue(1);
  
  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ scale: scale.get() }],
    };
  });

  return (
    <Pressable
      disabled={disabled}
      onPressIn={() => {
        scale.set(withSpring(0.97, { damping: 15, stiffness: 300 }));
      }}
      onPressOut={() => {
        scale.set(withSpring(1, { damping: 15, stiffness: 300 }));
      }}
      onPress={(e) => {
        Haptics.selectionAsync();
        if (onPress) onPress(e);
      }}
    >
      <Animated.View style={[animatedStyle, style]}>
        {children}
      </Animated.View>
    </Pressable>
  );
}

export default function HomeScreen({
  userName = 'User',
  userProfile,
  onNavigateToCases,
  onNavigateToAssistant,
  onNavigateToBreathing,
}) {
  const [selectedMood, setSelectedMood] = useState(null);
  const [sosModalVisible, setSosModalVisible] = useState(false);

  const handleMoodSelect = async (moodId) => {
    setSelectedMood(moodId);
    try {
      // S2: user_id is no longer sent — the backend derives the case owner
      // from the authenticated victim's session (see api/intake/app_routes.py).
      await api.post('/api/v1/intake/app/checkin', { mood: moodId });
    } catch (e) {
      console.error("Failed to log mood:", e);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header Area */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.greetingMeta}>HI, {userName.toUpperCase()}</Text>
            <Text style={styles.largeTitle}>Today</Text>
          </View>

          {/* Right: Dedicated SOS Pill Button */}
          <ScalePressable
            style={styles.sosPillButton}
            onPress={() => setSosModalVisible(true)}
          >
            <ShieldAlert size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
            <Text style={styles.sosPillText}>SOS</Text>
          </ScalePressable>
        </View>

        {/* Hero Widget: Distress Index */}
        <ScalePressable style={styles.card} onPress={() => {}}>
          <View style={styles.cardHeader}>
            <View>
              <Text style={styles.cardTitle}>Distress Index & Prediction</Text>
              <View style={styles.liveIndicator}>
                <View style={styles.liveDot} />
                <Text style={styles.liveText}>Live Multimodal Score</Text>
              </View>
            </View>
            
            <View style={styles.metricRow}>
              <Text style={styles.metricValue}>0</Text>
              <Text style={styles.metricUnit}>pts</Text>
            </View>
          </View>
          <View style={styles.divider} />
          <DistressGauge score={0} maxScore={100} />
        </ScalePressable>

        {/* Secondary Card 1: Quick Check-in */}
        <ScalePressable style={styles.card} onPress={() => {}}>
          <View style={styles.cardHeaderGroup}>
            <Sparkles size={20} color={DS.primary.main} style={{ marginRight: 8 }} />
            <Text style={styles.cardTitle}>Quick Check-in</Text>
          </View>
          <Text style={styles.cardSubtitle}>How are you feeling right now?</Text>

          <View style={styles.moodRow}>
            {MOODS.map((m) => {
              const isSelected = selectedMood === m.id;
              return (
                <ScalePressable
                  key={m.id}
                  style={[
                    styles.moodPill,
                    isSelected && styles.moodPillSelected,
                  ]}
                  onPress={() => handleMoodSelect(m.id)}
                >
                  <Text style={styles.moodEmoji}>{m.emoji}</Text>
                  <Text
                    style={[
                      styles.moodLabel,
                      isSelected && styles.moodLabelSelected,
                    ]}
                  >
                    {m.label}
                  </Text>
                </ScalePressable>
              );
            })}
          </View>

          {selectedMood && (
            <View style={styles.moodLoggedNotice}>
              <CheckCircle2 size={16} color={DS.primary.main} style={{ marginRight: 8 }} />
              <Text style={styles.moodLoggedText}>
                Recorded. Baseline models adjusted.
              </Text>
            </View>
          )}
        </ScalePressable>

        {/* Secondary Card 2: Grounding Tool */}
        <ScalePressable style={styles.card} onPress={onNavigateToBreathing}>
          <View style={styles.groundingHeader}>
            <View style={styles.iconBox}>
              <Wind size={22} color="#FFFFFF" />
            </View>
            <View style={styles.groundingTextContent}>
              <Text style={styles.cardTitle}>Box Breathing</Text>
              <Text style={styles.cardSubtitle}>
                Calm the nervous system with guided pacing
              </Text>
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>Begin 2-Min Grounding</Text>
          </View>
        </ScalePressable>
      </ScrollView>

      {/* SOS Modal */}
      <SOSModal
        visible={sosModalVisible}
        onClose={() => setSosModalVisible(false)}
        onDispatched={() => {}}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F2F2F7', // iOS Inset Grouped background
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 100,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: 24,
    paddingHorizontal: 4,
  },
  headerLeft: {
    flex: 1,
  },
  greetingMeta: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(60, 60, 67, 0.6)', // iOS secondary label opacity
    letterSpacing: 1.2,
    marginBottom: 2,
  },
  largeTitle: {
    fontSize: 34,
    fontWeight: 'bold',
    color: '#000000',
    letterSpacing: 0.37,
  },
  sosPillButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: DS.accent.sos,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    marginBottom: 4,
  },
  sosPillText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: 'bold',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16, // continuous squircle
    padding: 16,
    marginBottom: 16,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#000000',
    letterSpacing: -0.41,
  },
  liveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: DS.accent.sage,
    marginRight: 6,
  },
  liveText: {
    fontSize: 11,
    color: 'rgba(60, 60, 67, 0.6)',
    fontWeight: '500',
  },
  metricRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  metricValue: {
    fontSize: 22,
    fontWeight: 'bold',
    color: DS.primary.main,
    fontVariant: ['tabular-nums'], // Bold tabular figures
  },
  metricUnit: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(60, 60, 67, 0.6)',
    marginLeft: 2,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(60, 60, 67, 0.15)', // iOS hairline
    marginVertical: 16,
  },
  cardHeaderGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  cardSubtitle: {
    fontSize: 13,
    color: 'rgba(60, 60, 67, 0.6)',
    marginBottom: 16,
  },
  moodRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  moodPill: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    marginHorizontal: 3,
    backgroundColor: '#F2F2F7', // iOS nested grouped background
    borderRadius: 12,
  },
  moodPillSelected: {
    backgroundColor: 'rgba(138, 121, 184, 0.12)', // Subtle lavender tint highlight
  },
  moodEmoji: {
    fontSize: 22,
    marginBottom: 6,
  },
  moodLabel: {
    fontSize: 11,
    color: 'rgba(60, 60, 67, 0.6)',
    fontWeight: '500',
  },
  moodLabelSelected: {
    color: DS.primary.main,
    fontWeight: '700',
  },
  moodLoggedNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(60, 60, 67, 0.15)',
  },
  moodLoggedText: {
    fontSize: 13,
    color: 'rgba(60, 60, 67, 0.6)',
    flex: 1,
  },
  groundingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: DS.primary.main, // rich lavender fill
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  groundingTextContent: {
    flex: 1,
  },
  primaryButton: {
    backgroundColor: DS.primary.main, // refined lavender fill
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
});
