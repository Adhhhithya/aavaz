import React, { useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, Animated, TouchableOpacity, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AlertTriangle, Clock, MapPin, ChevronRight, CheckCircle } from 'lucide-react-native';
import Svg, { Circle } from 'react-native-svg';
import { DS, glassCard } from '../theme/designSystem';

const { width } = Dimensions.get('window');
const SOS_SIZE = 140;

export default function SOSScreen() {
  const [isActive, setIsActive] = useState(false);
  const holdAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  
  // 3 Staggered wave rings
  useEffect(() => {
    if (!isActive) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.3, duration: 1500, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 1500, useNativeDriver: true })
        ])
      ).start();
    }
  }, [isActive]);

  const startHold = () => {
    Animated.timing(holdAnim, { toValue: 1, duration: 3000, useNativeDriver: false }).start(({ finished }) => {
      if (finished) setIsActive(true);
    });
  };

  const cancelHold = () => {
    Animated.timing(holdAnim, { toValue: 0, duration: 300, useNativeDriver: false }).start();
  };

  const holdProgress = holdAnim.interpolate({ inputRange: [0, 1], outputRange: [0, Math.PI * 2 * ((SOS_SIZE + 20) / 2)] });

  return (
    <SafeAreaView style={styles.root}>
      {/* Ambient Red Radial Vignette */}
      <View style={StyleSheet.absoluteFillObject}>
        <LinearGradient colors={isActive ? ['#450a0a', '#080C15'] : ['#1f0505', '#080C15']} style={StyleSheet.absoluteFillObject} />
      </View>

      <View style={styles.container}>
        {!isActive ? (
          <View style={styles.idleCenter}>
            <Text style={styles.instruction}>Hold for 3 seconds to activate</Text>
            
            <View style={styles.btnWrapper}>
              <Animated.View style={[styles.pulseRing, { transform: [{ scale: pulseAnim }], opacity: 0.2 }]} />
              <Animated.View style={[styles.pulseRing, { transform: [{ scale: Animated.multiply(pulseAnim, 1.2) }], opacity: 0.1 }]} />
              
              {/* Animated SVG Border Fill */}
              <Svg width={SOS_SIZE + 30} height={SOS_SIZE + 30} style={{ position: 'absolute' }}>
                <Circle cx={(SOS_SIZE+30)/2} cy={(SOS_SIZE+30)/2} r={(SOS_SIZE+10)/2} stroke="rgba(239, 68, 68, 0.2)" strokeWidth={6} fill="none" />
                <AnimatedCircle
                  cx={(SOS_SIZE+30)/2} cy={(SOS_SIZE+30)/2} r={(SOS_SIZE+10)/2}
                  stroke={DS.accent.crimson} strokeWidth={6} fill="none"
                  strokeDasharray={Math.PI * 2 * ((SOS_SIZE + 10) / 2)}
                  strokeDashoffset={Animated.subtract(Math.PI * 2 * ((SOS_SIZE + 10) / 2), holdProgress)}
                  strokeLinecap="round" transform={`rotate(-90 ${(SOS_SIZE+30)/2} ${(SOS_SIZE+30)/2})`}
                />
              </Svg>

              <TouchableOpacity style={styles.sosButton} onPressIn={startHold} onPressOut={cancelHold} activeOpacity={0.9}>
                <LinearGradient colors={DS.gradient.danger} style={styles.sosGrad}>
                  <AlertTriangle size={50} color="#fff" />
                  <Text style={styles.sosText}>SOS</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View style={styles.activeCenter}>
            <Text style={styles.activeTitle}>SOS ACTIVATED</Text>
            
            {/* Live Timer Card */}
            <View style={[glassCard, styles.timerCard]}>
              <Clock size={24} color={DS.accent.crimson} />
              <Text style={styles.timerText}>29:45</Text>
              <Text style={styles.timerSub}>remaining until district auto-escalation</Text>
            </View>

            {/* Telemetry Card */}
            <View style={[glassCard, styles.telemetryCard]}>
              <MapPin size={18} color={DS.accent.teal} />
              <View style={{ marginLeft: 10 }}>
                <Text style={styles.telemetryTitle}>Location Broadcast Active</Text>
                <Text style={styles.telemetryValue}>28.6139°N, 77.2090°E • Delhi District</Text>
              </View>
            </View>

            {/* Escalation Steps */}
            <View style={styles.stepsWrap}>
              <View style={styles.stepRow}>
                <CheckCircle size={20} color={DS.accent.emerald} />
                <Text style={styles.stepDone}>Assigned Counsellor Alerted</Text>
              </View>
              <View style={styles.stepConnector} />
              <View style={styles.stepRow}>
                <Clock size={20} color={DS.accent.amber} />
                <Text style={styles.stepPending}>District Dashboard Escalation (Pending)</Text>
              </View>
            </View>

            {/* Slide to Resolve */}
            <TouchableOpacity style={styles.resolveBtn} onPress={() => setIsActive(false)}>
              <Text style={styles.resolveText}>Slide to Resolve SOS</Text>
              <ChevronRight size={20} color={DS.accent.crimson} />
            </TouchableOpacity>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: DS.canvas.deep },
  container: { flex: 1, padding: DS.spacing.lg },
  
  idleCenter: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  instruction: { ...DS.type.headline, color: DS.text.secondary, marginBottom: 60 },
  btnWrapper: { width: SOS_SIZE + 40, height: SOS_SIZE + 40, justifyContent: 'center', alignItems: 'center' },
  pulseRing: { position: 'absolute', width: SOS_SIZE + 60, height: SOS_SIZE + 60, borderRadius: (SOS_SIZE + 60)/2, backgroundColor: DS.accent.crimson },
  sosButton: { width: SOS_SIZE, height: SOS_SIZE, borderRadius: SOS_SIZE/2, overflow: 'hidden', elevation: 20, shadowColor: DS.accent.crimson, shadowRadius: 30, shadowOpacity: 0.8 },
  sosGrad: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  sosText: { ...DS.type.title, marginTop: 4, letterSpacing: 2 },

  activeCenter: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  activeTitle: { ...DS.type.display, color: DS.accent.crimson, marginBottom: DS.spacing.xl, textAlign: 'center' },
  
  timerCard: { width: '100%', alignItems: 'center', paddingVertical: DS.spacing.xl, backgroundColor: 'rgba(239, 68, 68, 0.1)', borderColor: DS.accent.crimson + '40', marginBottom: DS.spacing.md },
  timerText: { ...DS.type.heroDisplay, color: DS.accent.crimson, marginVertical: 8 },
  timerSub: { ...DS.type.caption, color: DS.accent.crimson },

  telemetryCard: { width: '100%', flexDirection: 'row', alignItems: 'center', marginBottom: DS.spacing.lg },
  telemetryTitle: { ...DS.type.label, color: DS.text.primary },
  telemetryValue: { ...DS.type.caption, fontFamily: 'monospace', marginTop: 4 },

  stepsWrap: { width: '100%', marginBottom: DS.spacing.xl, paddingHorizontal: 10 },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepDone: { ...DS.type.label, color: DS.accent.emerald },
  stepPending: { ...DS.type.label, color: DS.accent.amber },
  stepConnector: { width: 2, height: 20, backgroundColor: DS.glass.border, marginLeft: 9, marginVertical: 4 },

  resolveBtn: { width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: DS.glass.surface, paddingVertical: 16, borderRadius: 24, borderWidth: 1, borderColor: DS.accent.crimson + '60', gap: 10 },
  resolveText: { ...DS.type.headline, color: DS.accent.crimson },
});
