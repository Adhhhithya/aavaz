import React, { useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableWithoutFeedback,
  Dimensions,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import {
  AlertTriangle,
  ShieldAlert,
  Info,
  CheckCircle2,
  X,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { DS } from '../theme/designSystem';
import HapticButton from './HapticButton';
import ScalePressable from './ScalePressable';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

/**
 * Universal Warning & Alert Modal for AAVAZ.
 * Replaces disruptive alert popups and red error screens with a gentle,
 * trauma-informed, beautifully styled modal.
 */
export default function WarningModal({
  visible = false,
  title = 'Notice',
  message = '',
  type = 'warning', // 'warning' | 'error' | 'info' | 'success'
  buttonText = 'Understood',
  onConfirm,
  secondaryText,
  onSecondary,
  onClose,
}) {
  // Reanimated values for card entrance/exit
  const scale = useSharedValue(0.94);
  const opacity = useSharedValue(0);
  const backdropOpacity = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      // Gentle spring in
      backdropOpacity.value = withTiming(1, { duration: 220 });
      scale.value = withSpring(1, {
        duration: 350,
        dampingRatio: 0.85,
      });
      opacity.value = withTiming(1, { duration: 180 });

      // Subtle haptic notification
      if (type === 'error' || type === 'warning') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      } else {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
    } else {
      backdropOpacity.value = withTiming(0, { duration: 160 });
      scale.value = withTiming(0.94, { duration: 160 });
      opacity.value = withTiming(0, { duration: 160 });
    }
  }, [visible, type]);

  const animatedBackdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }));

  const animatedCardStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  if (!visible) return null;

  // Visual styling variants based on alert type
  const getTypeConfig = () => {
    switch (type) {
      case 'error':
        return {
          icon: <ShieldAlert size={30} color={DS.accent.sos} />,
          badgeBg: DS.accent.sosBg,
          borderColor: 'rgba(217, 93, 93, 0.22)',
          accentColor: DS.accent.sos,
          defaultTitle: 'Attention Needed',
          btnVariant: 'danger',
        };
      case 'info':
        return {
          icon: <Info size={30} color={DS.primary.main} />,
          badgeBg: DS.primary.muted,
          borderColor: DS.canvas.border,
          accentColor: DS.primary.main,
          defaultTitle: 'Information',
          btnVariant: 'primary',
        };
      case 'success':
        return {
          icon: <CheckCircle2 size={30} color={DS.accent.sage} />,
          badgeBg: 'rgba(104, 176, 135, 0.14)',
          borderColor: 'rgba(104, 176, 135, 0.25)',
          accentColor: DS.accent.sage,
          defaultTitle: 'Success',
          btnVariant: 'primary',
        };
      case 'warning':
      default:
        return {
          icon: <AlertTriangle size={30} color={DS.accent.amber} />,
          badgeBg: 'rgba(229, 169, 98, 0.15)',
          borderColor: 'rgba(229, 169, 98, 0.25)',
          accentColor: DS.accent.amber,
          defaultTitle: 'Important Notice',
          btnVariant: 'primary',
        };
    }
  };

  const config = getTypeConfig();
  const displayTitle = title || config.defaultTitle;

  const handleConfirm = () => {
    onConfirm?.();
    onClose?.();
  };

  const handleSecondary = () => {
    onSecondary?.();
    onClose?.();
  };

  return (
    <Modal
      transparent
      visible={visible}
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        {/* Animated dim backdrop */}
        <TouchableWithoutFeedback onPress={onClose}>
          <Animated.View style={[styles.backdrop, animatedBackdropStyle]} />
        </TouchableWithoutFeedback>

        {/* Modal Card */}
        <Animated.View style={[styles.card, animatedCardStyle]}>
          {/* Close button top right */}
          <ScalePressable style={styles.closeBtn} onPress={onClose} hitSlop={12}>
            <X size={18} color={DS.text.muted} />
          </ScalePressable>

          {/* Type Badge Icon */}
          <View style={[styles.iconBadge, { backgroundColor: config.badgeBg }]}>
            {config.icon}
          </View>

          {/* Title & Message */}
          <Text style={styles.title}>{displayTitle}</Text>
          <Text style={styles.message}>{message}</Text>

          {/* Action Buttons */}
          <View style={styles.buttonGroup}>
            {secondaryText && (
              <HapticButton
                title={secondaryText}
                onPress={handleSecondary}
                variant="secondary"
                style={styles.secondaryButton}
                textStyle={styles.secondaryButtonText}
              />
            )}
            <HapticButton
              title={buttonText}
              onPress={handleConfirm}
              variant={config.btnVariant}
              style={[
                styles.primaryButton,
                secondaryText && styles.flexButton,
                type === 'warning' && styles.amberButton,
              ]}
              textStyle={styles.primaryButtonText}
            />
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: DS.spacing.lg,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.52)',
  },
  card: {
    width: Math.min(SCREEN_WIDTH - 36, 400),
    backgroundColor: DS.canvas.surface,
    borderRadius: DS.radius.xl,
    paddingHorizontal: DS.spacing.xl,
    paddingTop: DS.spacing.xl + 4,
    paddingBottom: DS.spacing.xl,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: DS.canvas.border,
    ...DS.shadow.ambient,
    shadowOpacity: 0.16,
    shadowRadius: 18,
    elevation: 12,
  },
  closeBtn: {
    position: 'absolute',
    top: 14,
    right: 14,
    padding: 6,
    borderRadius: DS.radius.full,
    backgroundColor: DS.canvas.surfaceSubtle,
  },
  iconBadge: {
    width: 60,
    height: 60,
    borderRadius: DS.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: DS.spacing.md,
  },
  title: {
    fontSize: 19,
    fontWeight: '700',
    color: DS.text.primary,
    textAlign: 'center',
    marginBottom: DS.spacing.xs + 2,
    letterSpacing: -0.3,
  },
  message: {
    fontSize: 14,
    fontWeight: '400',
    color: DS.text.secondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: DS.spacing.xl,
    paddingHorizontal: DS.spacing.sm,
  },
  buttonGroup: {
    width: '100%',
    flexDirection: 'row',
    gap: DS.spacing.md,
    justifyContent: 'center',
  },
  flexButton: {
    flex: 1,
  },
  primaryButton: {
    width: '100%',
    height: 48,
    borderRadius: DS.radius.pill,
    backgroundColor: DS.primary.main,
  },
  amberButton: {
    backgroundColor: '#8A79B8', // Keep unified primary with subtle lavender
  },
  primaryButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: DS.text.light,
  },
  secondaryButton: {
    flex: 1,
    height: 48,
    borderRadius: DS.radius.pill,
    backgroundColor: DS.canvas.surfaceSubtle,
    borderWidth: 1,
    borderColor: DS.canvas.border,
  },
  secondaryButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: DS.text.secondary,
  },
});
