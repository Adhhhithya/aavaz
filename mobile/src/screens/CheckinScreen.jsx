import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, MoreHorizontal, Check } from 'lucide-react-native';
import Animated, { 
  useSharedValue, 
  useAnimatedStyle, 
  withSpring,
  withTiming,
  interpolateColor
} from 'react-native-reanimated';
import Svg, { Circle, Path, Line } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import ScalePressable from '../components/ScalePressable';
import { api } from '../services/api';
import { useLanguage } from '../context/LanguageContext';

const { width } = Dimensions.get('window');
const SLIDER_W = Math.min(width - 48, 360);
const SLIDER_H = 120;

const MOOD_LEVELS = [
  { level: 1, label: "I'm Feeling Depressed" },
  { level: 2, label: "I'm Feeling Sad/Anxious" },
  { level: 3, label: "I'm Feeling Neutral" },
  { level: 4, label: "I'm Feeling Good" },
  { level: 5, label: "I'm Feeling Excellent" },
];

const THEME = {
  bg: '#B983FF', // Solid purple background matching the image
  faceActiveBg: '#FFFFFF',
  faceActiveFeature: '#9333EA', 
  faceInactiveBg: 'rgba(0,0,0,0.15)',
  faceInactiveFeature: 'rgba(0,0,0,0.4)',
  arcLine: 'rgba(0,0,0,0.15)',
};

const MoodFace = ({ level, size = 46, isActive }) => {
  const isLarge = size > 50;
  const strokeWidth = isLarge ? 6 : 3;

  const circleFill = isActive ? THEME.faceActiveBg : THEME.faceInactiveBg;
  // Make feature color adapt based on background color when active for a better look, 
  // or just use a dark color since the background changes
  const featureColor = isActive ? '#000000' : THEME.faceInactiveFeature;

  if (level === 1) {
    return (
      <Svg width={size} height={size} viewBox="0 0 46 46">
        <Circle cx="23" cy="23" r="23" fill={circleFill} />
        <Line x1="12" y1="14" x2="18" y2="20" stroke={featureColor} strokeWidth={strokeWidth} strokeLinecap="round" />
        <Line x1="18" y1="14" x2="12" y2="20" stroke={featureColor} strokeWidth={strokeWidth} strokeLinecap="round" />
        <Line x1="28" y1="14" x2="34" y2="20" stroke={featureColor} strokeWidth={strokeWidth} strokeLinecap="round" />
        <Line x1="34" y1="14" x2="28" y2="20" stroke={featureColor} strokeWidth={strokeWidth} strokeLinecap="round" />
        <Path d="M 14 31 Q 23 20 32 31" fill="none" stroke={featureColor} strokeWidth={strokeWidth} strokeLinecap="round" />
      </Svg>
    );
  }
  if (level === 2) {
    return (
      <Svg width={size} height={size} viewBox="0 0 46 46">
        <Circle cx="23" cy="23" r="23" fill={circleFill} />
        <Circle cx="16" cy="18" r={isLarge ? 4 : 2.5} fill={featureColor} />
        <Circle cx="30" cy="18" r={isLarge ? 4 : 2.5} fill={featureColor} />
        <Path d="M 16 30 Q 23 23 30 30" fill="none" stroke={featureColor} strokeWidth={strokeWidth} strokeLinecap="round" />
      </Svg>
    );
  }
  if (level === 3) {
    return (
      <Svg width={size} height={size} viewBox="0 0 46 46">
        <Circle cx="23" cy="23" r="23" fill={circleFill} />
        <Circle cx="16" cy="18" r={isLarge ? 4 : 2.5} fill={featureColor} />
        <Circle cx="30" cy="18" r={isLarge ? 4 : 2.5} fill={featureColor} />
        <Line x1="16" y1="28" x2="30" y2="28" stroke={featureColor} strokeWidth={strokeWidth} strokeLinecap="round" />
      </Svg>
    );
  }
  if (level === 4) {
    return (
      <Svg width={size} height={size} viewBox="0 0 46 46">
        <Circle cx="23" cy="23" r="23" fill={circleFill} />
        <Circle cx="16" cy="18" r={isLarge ? 4 : 2.5} fill={featureColor} />
        <Circle cx="30" cy="18" r={isLarge ? 4 : 2.5} fill={featureColor} />
        <Path d="M 15 26 Q 23 34 31 26" fill="none" stroke={featureColor} strokeWidth={strokeWidth} strokeLinecap="round" />
      </Svg>
    );
  }
  if (level === 5) {
    return (
      <Svg width={size} height={size} viewBox="0 0 46 46">
        <Circle cx="23" cy="23" r="23" fill={circleFill} />
        <Path d="M 13 19 Q 16 14 19 19" fill="none" stroke={featureColor} strokeWidth={strokeWidth} strokeLinecap="round" />
        <Path d="M 27 19 Q 30 14 33 19" fill="none" stroke={featureColor} strokeWidth={strokeWidth} strokeLinecap="round" />
        <Path d="M 15 26 Q 23 37 31 26 Z" fill={featureColor} />
      </Svg>
    );
  }
  return null;
};

export default function CheckinScreen({ onNavigateHome }) {
  const { t } = useLanguage();
  const [level, setLevel] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  const faceScale = useSharedValue(1);
  const animatedLevel = useSharedValue(1);

  useEffect(() => {
    faceScale.value = withSpring(1.1, { stiffness: 300, damping: 10 }, () => {
      faceScale.value = withSpring(1);
    });
    animatedLevel.value = withTiming(level, { duration: 300 });
  }, [level]);

  const animatedFaceStyle = useAnimatedStyle(() => {
    return {
      transform: [{ scale: faceScale.value }],
    };
  });

  const animatedBgStyle = useAnimatedStyle(() => {
    const bg = interpolateColor(
      animatedLevel.value,
      [1, 2, 3, 4, 5],
      ['#EF4444', '#F97316', '#F59E0B', '#FBBF24', '#FDE047'] // Red -> Orange -> Yellow
    );
    return {
      backgroundColor: bg
    };
  });

  const handleSelectLevel = (newLevel) => {
    Haptics.selectionAsync();
    setLevel(newLevel);
    setIsSubmitted(false);
  };

  const handleConfirm = async () => {
    if (isSubmitting) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setIsSubmitting(true);
    
    try {
      await api.post('/api/v1/intake/app/checkin', { mood: MOOD_LEVELS[level-1].label, level: level });
      setIsSubmitted(true);
      confirmScale.value = withSpring(1.05, { stiffness: 200, damping: 10 }, () => {
        confirmScale.value = withSpring(1);
      });
      
      setTimeout(() => {
        if (onNavigateHome) onNavigateHome();
      }, 1000);
    } catch (e) {
      console.error(e);
      setIsSubmitting(false);
    }
  };

  const confirmScale = useSharedValue(1);

  const buttonAnimatedStyle = useAnimatedStyle(() => {
    return {
      backgroundColor: withTiming(isSubmitted ? '#10B981' : '#FFFFFF', { duration: 300 }),
      transform: [{ scale: confirmScale.value }]
    };
  });

  const textAnimatedStyle = useAnimatedStyle(() => {
    return {
      color: withTiming(isSubmitted ? '#FFFFFF' : '#000000', { duration: 300 }),
    };
  });

  const currentMood = MOOD_LEVELS[level - 1];

  return (
    <Animated.View style={[styles.container, animatedBgStyle]}>
      <SafeAreaView style={styles.safeArea}>
        {/* Header */}
        <View style={styles.header}>
          <ScalePressable onPress={onNavigateHome} style={styles.iconBtn}>
            <ArrowLeft color="#FFFFFF" size={24} />
          </ScalePressable>
          <Text style={styles.headerTitle}>{t('checkinTitle')}</Text>
          <ScalePressable style={styles.iconBtn}>
            <MoreHorizontal color="#FFFFFF" size={24} />
          </ScalePressable>
        </View>

        <View style={styles.content}>
          <Text style={styles.title}>{t('howAreYouFeeling')}</Text>

          {/* Large Face */}
          <Animated.View style={[styles.largeFaceContainer, animatedFaceStyle]}>
            <MoodFace level={level} size={150} isActive={true} />
          </Animated.View>

          <Text style={styles.moodLabel}>{currentMood.label}</Text>

          {/* Arc Slider */}
          <View style={[styles.sliderContainer, { width: SLIDER_W, height: SLIDER_H }]}>
            <View style={StyleSheet.absoluteFill}>
              <Svg width={SLIDER_W} height={SLIDER_H} viewBox={`0 0 ${SLIDER_W} ${SLIDER_H}`}>
                <Path 
                  d={`M 24 30 Q ${SLIDER_W/2} 130 ${SLIDER_W - 24} 30`} 
                  fill="none" 
                  stroke={THEME.arcLine} 
                  strokeWidth="6" 
                  strokeLinecap="round" 
                />
              </Svg>
            </View>

            {[1, 2, 3, 4, 5].map((l, idx) => {
              const isActive = level === l;
              const tVal = idx / 4;
              
              const p0x = 24, p1x = SLIDER_W/2, p2x = SLIDER_W - 24;
              const p0y = 30, p1y = 130, p2y = 30;

              const x = Math.pow(1-tVal, 2)*p0x + 2*(1-tVal)*tVal*p1x + Math.pow(tVal, 2)*p2x;
              const y = Math.pow(1-tVal, 2)*p0y + 2*(1-tVal)*tVal*p1y + Math.pow(tVal, 2)*p2y;
              
              const btnSize = isActive ? 46 : 36;

              return (
                <ScalePressable
                  key={l}
                  onPress={() => handleSelectLevel(l)}
                  style={[
                    styles.smallFaceBtn,
                    { 
                      left: x - btnSize/2,
                      top: y - btnSize/2,
                      width: btnSize,
                      height: btnSize,
                    },
                    isActive && styles.activeFaceBtn
                  ]}
                >
                  <MoodFace level={l} size={btnSize} isActive={isActive} />
                </ScalePressable>
              );
            })}
          </View>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <ScalePressable style={[styles.confirmBtn, buttonAnimatedStyle]} onPress={handleConfirm}>
            {isSubmitted ? (
              <Check color="#FFFFFF" size={24} />
            ) : null}
            <Animated.Text style={[styles.confirmBtnText, textAnimatedStyle]}>
              {isSubmitted ? (t('btnSaved') || "Mood Saved!") : (t('btnSubmitCheckin') || "Set Mood")}
            </Animated.Text>
          </ScalePressable>
        </View>
      </SafeAreaView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: THEME.bg,
  },
  safeArea: {
    flex: 1,
    paddingHorizontal: 24,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
  },
  iconBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    color: 'rgba(255,255,255,0)', // Hide original title text to match screenshot if needed, or keep it translucent. Let's keep it hidden.
    fontSize: 13,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 40,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 40,
  },
  largeFaceContainer: {
    marginBottom: 30,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 10,
  },
  moodLabel: {
    fontSize: 18,
    color: '#FFFFFF',
    marginBottom: 60,
  },
  sliderContainer: {
    justifyContent: 'center',
    position: 'relative',
  },
  smallFaceBtn: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 30,
  },
  activeFaceBtn: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 5,
  },
  footer: {
    paddingBottom: 100, 
  },
  confirmBtn: {
    flexDirection: 'row',
    paddingVertical: 18,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  confirmBtnText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000000',
  },
});
