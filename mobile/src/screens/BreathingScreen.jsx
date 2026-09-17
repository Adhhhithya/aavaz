import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, Easing } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, Wind } from 'lucide-react-native';
import { DS } from '../theme/designSystem';

export default function BreathingScreen({ onNavigateBack }) {
  const [phaseText, setPhaseText] = useState('Get Ready...');
  const [timer, setTimer] = useState(120); // 2 minutes
  const [isActive, setIsActive] = useState(false);
  
  // Animation value for the breathing circle (scale)
  const circleScale = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(0.7)).current;
  
  // Animation sequences
  const breatheIn = Animated.timing(circleScale, {
    toValue: 2.2, // Expand
    duration: 4000,
    easing: Easing.inOut(Easing.ease),
    useNativeDriver: true,
  });
  
  const breatheOut = Animated.timing(circleScale, {
    toValue: 1, // Contract
    duration: 4000,
    easing: Easing.inOut(Easing.ease),
    useNativeDriver: true,
  });

  const fadeInOut = Animated.sequence([
    Animated.timing(opacity, { toValue: 1, duration: 4000, useNativeDriver: true }),
    Animated.timing(opacity, { toValue: 0.7, duration: 4000, useNativeDriver: true })
  ]);

  useEffect(() => {
    let interval;
    let cycleTimeout;
    let isCancelled = false;

    if (isActive) {
      interval = setInterval(() => {
        setTimer((t) => {
          if (t <= 1) {
            setIsActive(false);
            setPhaseText('Session Complete');
            return 0;
          }
          return t - 1;
        });
      }, 1000);

      const runCycle = async () => {
        while (!isCancelled) {
          // Breathe In (4s)
          setPhaseText('Breathe In');
          Animated.parallel([breatheIn, fadeInOut]).start();
          await new Promise(r => setTimeout(r, 4000));
          if (isCancelled) break;
          
          // Hold (4s)
          setPhaseText('Hold');
          await new Promise(r => setTimeout(r, 4000));
          if (isCancelled) break;
          
          // Breathe Out (4s)
          setPhaseText('Breathe Out');
          Animated.parallel([breatheOut]).start();
          await new Promise(r => setTimeout(r, 4000));
          if (isCancelled) break;
        }
      };
      
      runCycle();
    } else {
      circleScale.setValue(1);
      opacity.setValue(0.7);
    }

    return () => {
      isCancelled = true;
      if (interval) clearInterval(interval);
      circleScale.stopAnimation();
      opacity.stopAnimation();
    };
  }, [isActive]);

  const startSession = () => {
    setIsActive(true);
    setTimer(120);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={onNavigateBack}>
          <ArrowLeft size={24} color={DS.text.primary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Grounding Exercise</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.container}>
        <Wind size={32} color={DS.primary.main} style={{ marginBottom: DS.spacing.xl }} />
        
        <View style={styles.animationContainer}>
          <Animated.View 
            style={[
              styles.breathingCircle,
              { 
                transform: [{ scale: circleScale }],
                opacity: opacity
              }
            ]} 
          />
          <View style={styles.centerDot} />
        </View>

        <View style={styles.infoContainer}>
          <Text style={styles.phaseText}>{phaseText}</Text>
          <Text style={styles.timerText}>
            {Math.floor(timer / 60)}:{(timer % 60).toString().padStart(2, '0')}
          </Text>
        </View>

        {!isActive ? (
          <TouchableOpacity style={styles.actionButton} onPress={startSession}>
            <Text style={styles.actionButtonText}>
              {timer === 0 ? 'Start Again' : 'Begin 2-Minute Session'}
            </Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={styles.stopButton} onPress={() => { setIsActive(false); setPhaseText('Paused'); }}>
            <Text style={styles.stopButtonText}>Pause Session</Text>
          </TouchableOpacity>
        )}
      </View>
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
    paddingHorizontal: DS.spacing.md,
    paddingVertical: DS.spacing.md,
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: DS.text.primary,
  },
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 60,
  },
  animationContainer: {
    width: 250,
    height: 250,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: DS.spacing.xxl,
  },
  breathingCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: DS.accent.sage,
    position: 'absolute',
  },
  centerDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    ...DS.shadow.card,
  },
  infoContainer: {
    alignItems: 'center',
    height: 100,
  },
  phaseText: {
    fontSize: 28,
    fontWeight: '800',
    color: DS.primary.main,
    marginBottom: 8,
  },
  timerText: {
    fontSize: 20,
    fontWeight: '600',
    color: DS.text.muted,
  },
  actionButton: {
    backgroundColor: DS.primary.main,
    paddingHorizontal: DS.spacing.xl,
    paddingVertical: DS.spacing.md,
    borderRadius: DS.radius.pill,
    marginTop: DS.spacing.xl,
    ...DS.shadow.card,
  },
  actionButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
  },
  stopButton: {
    backgroundColor: 'rgba(217, 93, 93, 0.12)',
    paddingHorizontal: DS.spacing.xl,
    paddingVertical: DS.spacing.md,
    borderRadius: DS.radius.pill,
    marginTop: DS.spacing.xl,
  },
  stopButtonText: {
    color: DS.accent.sos,
    fontSize: 16,
    fontWeight: '700',
  },
});
