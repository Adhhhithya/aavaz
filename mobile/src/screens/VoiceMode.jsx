import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Mic, X, Check, ChevronLeft } from 'lucide-react-native';
import Animated, { 
  useSharedValue, 
  useAnimatedStyle, 
  withTiming, 
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import * as Speech from 'expo-speech';
import { DS } from '../theme/designSystem';

const { width } = Dimensions.get('window');

const AnimatedBar = ({ isRecording, index }) => {
  const height = useSharedValue(20);
  
  useEffect(() => {
    let interval;
    if (isRecording) {
      interval = setInterval(() => {
        height.value = withTiming(20 + Math.random() * 80, { duration: 150 });
      }, 150 + index * 10);
    } else {
      height.value = withTiming(20, { duration: 300 });
    }
    return () => clearInterval(interval);
  }, [isRecording]);

  const style = useAnimatedStyle(() => ({
    height: height.value,
  }));

  return <Animated.View style={[styles.bar, style, isRecording && styles.barActive]} />;
};

export default function VoiceMode({ onClose, onSend, initialPrompt }) {
  const [isRecording, setIsRecording] = useState(false);
  const [hasRecorded, setHasRecorded] = useState(false);
  const [timer, setTimer] = useState(0);

  useEffect(() => {
    let interval;
    if (isRecording) {
      interval = setInterval(() => {
        setTimer(t => t + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isRecording]);

  useEffect(() => {
    if (isRecording && timer >= 4) {
      handleSubmit();
    }
  }, [timer, isRecording]);

  useEffect(() => {
    if (initialPrompt) {
      Speech.speak(initialPrompt, { language: 'en-IN' });
    }
    return () => Speech.stop();
  }, [initialPrompt]);

  const handleMicToggle = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (!isRecording) {
      setIsRecording(true);
      setHasRecorded(false);
      setTimer(0);
    } else {
      setIsRecording(false);
      setHasRecorded(true);
    }
  };

  const formatTime = (secs) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const handleSubmit = () => {
    if (hasRecorded || isRecording) {
      setIsRecording(false);
      onSend("[Voice Memo: User expressed themselves verbally. Please respond briefly with empathy.]");
      // Do not close so user can see the reply
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={onClose}>
          <ChevronLeft size={28} color={DS.text.primary} />
        </TouchableOpacity>
      </View>

      <View style={styles.content}>
        <View style={{ flex: 1, justifyContent: 'center', width: '100%', maxHeight: 250, marginBottom: 40 }}>
          <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}>
            <Text style={[styles.promptText, hasRecorded && styles.promptTextMuted]}>
              {initialPrompt || "Say anything that's on your mind!"}
            </Text>
          </ScrollView>
        </View>

        <View style={styles.waveformContainer}>
          {[...Array(24)].map((_, i) => (
            <AnimatedBar key={i} index={i} isRecording={isRecording} />
          ))}
        </View>
      </View>

      <View style={styles.controls}>
        {hasRecorded ? (
          <TouchableOpacity style={styles.cancelBtn} onPress={() => { setHasRecorded(false); setTimer(0); }}>
            <X size={24} color="#FFFFFF" />
          </TouchableOpacity>
        ) : <View style={{ width: 60 }} />}

        <View style={styles.micWrapper}>
          <TouchableOpacity 
            style={[styles.hugeMic, isRecording && styles.hugeMicRecording]} 
            onPress={handleMicToggle}
          >
            <Mic size={40} color={isRecording ? "#000000" : "#FFFFFF"} />
          </TouchableOpacity>
          <Text style={styles.statusText}>
            {isRecording ? formatTime(timer) : hasRecorded ? formatTime(timer) : "Ready"}
          </Text>
        </View>

        {hasRecorded || isRecording ? (
          <TouchableOpacity style={styles.submitBtn} onPress={handleSubmit}>
            <Check size={24} color="#FFFFFF" />
          </TouchableOpacity>
        ) : <View style={{ width: 60 }} />}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: DS.canvas.base, // iOS inset grouped base color
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: DS.canvas.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 30,
  },
  promptText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: DS.text.primary,
    textAlign: 'center',
    lineHeight: 32,
  },
  promptTextMuted: {
    color: DS.text.muted,
  },
  waveformContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 120,
    width: '100%',
    gap: 4,
  },
  bar: {
    width: 8,
    backgroundColor: DS.primary.muted,
    borderRadius: 4,
  },
  barActive: {
    backgroundColor: DS.primary.main,
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 40,
    paddingBottom: 40,
  },
  micWrapper: {
    alignItems: 'center',
  },
  hugeMic: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#383331', // Dark charcoal/brown to match the design vibe
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 10,
    marginBottom: 16,
  },
  hugeMicRecording: {
    backgroundColor: '#FFFFFF',
  },
  statusText: {
    fontSize: 16,
    fontWeight: '600',
    color: DS.text.primary,
  },
  cancelBtn: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: DS.accent.amber, // Orange
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitBtn: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: DS.accent.sage, // Green
    alignItems: 'center',
    justifyContent: 'center',
  },
});
