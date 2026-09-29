import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Modal } from 'react-native';
import Animated, { 
  useSharedValue, 
  useAnimatedStyle, 
  withTiming,
  FadeIn,
  FadeOut
} from 'react-native-reanimated';
import { ShieldAlert, CheckCircle2 } from 'lucide-react-native';
import { DS } from '../theme/designSystem';
import HapticButton from './HapticButton';

export default function SOSModal({ visible, onClose, onDispatched }) {
  const [countdown, setCountdown] = useState(5);
  const [dispatched, setDispatched] = useState(false);
  
  // Reanimated scale for the modal card
  const scale = useSharedValue(0.8);
  const opacity = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      scale.value = withTiming(1, { duration: 200 });
      opacity.value = withTiming(1, { duration: 250 });
    } else {
      scale.value = withTiming(0.8, { duration: 200 });
      opacity.value = withTiming(0, { duration: 200 });
    }
  }, [visible, scale, opacity]);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ scale: scale.value }],
      opacity: opacity.value,
    };
  });

  useEffect(() => {
    let timer;
    if (visible && !dispatched) {
      setCountdown(5);
      timer = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            handleDispatch();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else if (!visible) {
      setCountdown(5);
      setDispatched(false);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [visible, dispatched]);

  const handleDispatch = () => {
    setDispatched(true);
    if (onDispatched) {
      onDispatched();
    }
  };

  const handleCancel = () => {
    setDispatched(false);
    setCountdown(5);
    onClose();
  };

  if (!visible && opacity.value === 0) return null;

  return (
    <Modal
      transparent
      visible={visible}
      animationType="none" // We handle animation via Reanimated
      onRequestClose={handleCancel}
    >
      <View style={styles.overlay}>
        <Animated.View style={[styles.modalCard, animatedStyle]}>
          {!dispatched ? (
            <Animated.View entering={FadeIn} exiting={FadeOut} style={styles.contentContainer}>
              <View style={styles.iconCircle}>
                <ShieldAlert size={32} color={DS.accent.sos} />
              </View>

              <Text style={styles.title}>Trigger Emergency SOS?</Text>
              
              <Text style={styles.description}>
                This will immediately notify your designated emergency contacts and dispatch your live coordinates to the local case response authority.
              </Text>

              {/* Countdown badge */}
              <View style={styles.timerBadge}>
                <Text style={styles.timerLabel}>Auto-dispatching in</Text>
                <View style={styles.counterWrap}>
                  <Text style={styles.counterNumber} key={countdown}>{countdown}</Text>
                  <Text style={styles.counterSec}>seconds</Text>
                </View>
              </View>

              <View style={styles.buttonStack}>
                <HapticButton
                  title="Cancel SOS"
                  variant="secondary"
                  onPress={handleCancel}
                />
                <HapticButton
                  title="Dispatch Immediately"
                  variant="danger"
                  onPress={handleDispatch}
                />
              </View>
            </Animated.View>
          ) : (
            <Animated.View entering={FadeIn} exiting={FadeOut} style={styles.contentContainer}>
              <View style={[styles.iconCircle, { backgroundColor: 'rgba(104, 176, 135, 0.15)' }]}>
                <CheckCircle2 size={36} color={DS.accent.sage} />
              </View>

              <Text style={styles.title}>SOS Alert Dispatched</Text>
              
              <Text style={styles.description}>
                Your coordinates and emergency alert have been successfully transmitted to your assigned counselor and response team. Help is on the way.
              </Text>

              <View style={styles.buttonStack}>
                <HapticButton
                  title="Return to App"
                  variant="secondary"
                  onPress={handleCancel}
                  style={{ marginTop: DS.spacing.lg }}
                />
              </View>
            </Animated.View>
          )}
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(30, 31, 36, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: DS.spacing.lg,
  },
  modalCard: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: DS.canvas.surface,
    borderRadius: DS.radius.xl,
    padding: DS.spacing.xl,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: DS.canvas.border,
    shadowColor: DS.accent.sos,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 12,
  },
  contentContainer: {
    width: '100%',
    alignItems: 'center',
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: DS.accent.sosBg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: DS.spacing.md,
  },
  title: {
    fontSize: 18,
    fontFamily: 'Inter-Bold',
    color: DS.text.primary,
    textAlign: 'center',
    marginBottom: DS.spacing.sm,
  },
  description: {
    fontSize: 13,
    fontFamily: 'Inter-Medium',
    color: DS.text.muted,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: DS.spacing.lg,
  },
  timerBadge: {
    alignItems: 'center',
    backgroundColor: DS.canvas.surfaceSubtle,
    paddingVertical: DS.spacing.md,
    paddingHorizontal: DS.spacing.xl,
    borderRadius: DS.radius.md,
    width: '100%',
    marginBottom: DS.spacing.lg,
  },
  timerLabel: {
    fontSize: 12,
    fontFamily: 'Inter-Bold',
    color: DS.text.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  counterWrap: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginTop: 4,
  },
  counterNumber: {
    fontSize: 32,
    fontFamily: 'Inter-Black',
    color: DS.accent.sos,
  },
  counterSec: {
    fontSize: 13,
    fontFamily: 'Inter-Medium',
    color: DS.text.muted,
    marginLeft: 6,
  },
  buttonStack: {
    width: '100%',
    gap: DS.spacing.sm,
  },
});
