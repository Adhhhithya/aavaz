import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, Animated } from 'react-native';
import { AlertCircle, X, ShieldAlert, CheckCircle2 } from 'lucide-react-native';
import { DS } from '../theme/designSystem';

export default function SOSModal({ visible, onClose, onDispatched }) {
  const [countdown, setCountdown] = useState(5);
  const [dispatched, setDispatched] = useState(false);

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

  return (
    <Modal
      transparent
      visible={visible}
      animationType="fade"
      onRequestClose={handleCancel}
    >
      <View style={styles.overlay}>
        <View style={styles.modalCard}>
          {!dispatched ? (
            <>
              {/* Header Icon */}
              <View style={styles.iconCircle}>
                <ShieldAlert size={32} color={DS.accent.sos} />
              </View>

              <Text style={styles.title}>Trigger Emergency SOS?</Text>
              
              <Text style={styles.description}>
                This will immediately notify your designated emergency contacts and dispatch your live coordinates to the local case response authority.
              </Text>

              {/* 5-second Active Countdown Ring / Counter */}
              <View style={styles.timerBadge}>
                <Text style={styles.timerLabel}>Auto-dispatching in</Text>
                <View style={styles.counterWrap}>
                  <Text style={styles.counterNumber}>{countdown}</Text>
                  <Text style={styles.counterSec}>seconds</Text>
                </View>
              </View>

              {/* Action Buttons */}
              <View style={styles.buttonStack}>
                <TouchableOpacity
                  style={styles.cancelButton}
                  onPress={handleCancel}
                  activeOpacity={0.8}
                >
                  <Text style={styles.cancelButtonText}>Cancel SOS</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.dispatchNowButton}
                  onPress={handleDispatch}
                  activeOpacity={0.8}
                >
                  <Text style={styles.dispatchNowText}>Dispatch Immediately</Text>
                </TouchableOpacity>
              </View>
            </>
          ) : (
            <>
              {/* Dispatched Confirmation State */}
              <View style={[styles.iconCircle, { backgroundColor: 'rgba(104, 176, 135, 0.15)' }]}>
                <CheckCircle2 size={36} color={DS.accent.sage} />
              </View>

              <Text style={styles.title}>SOS Alert Dispatched</Text>
              
              <Text style={styles.description}>
                Your coordinates and emergency alert have been successfully transmitted to your assigned counselor and response team. Help is on the way.
              </Text>

              <TouchableOpacity
                style={[styles.cancelButton, { marginTop: DS.spacing.lg }]}
                onPress={handleCancel}
                activeOpacity={0.8}
              >
                <Text style={styles.cancelButtonText}>Return to App</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(30, 31, 36, 0.45)',
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
    ...DS.shadow.card,
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
    fontWeight: '700',
    color: DS.text.primary,
    textAlign: 'center',
    marginBottom: DS.spacing.sm,
  },
  description: {
    fontSize: 13,
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
    fontWeight: '800',
    color: DS.accent.sos,
  },
  counterSec: {
    fontSize: 13,
    color: DS.text.muted,
    marginLeft: 6,
    fontWeight: '500',
  },
  buttonStack: {
    width: '100%',
    gap: DS.spacing.sm,
  },
  cancelButton: {
    width: '100%',
    backgroundColor: DS.canvas.surfaceSubtle,
    borderWidth: 1,
    borderColor: DS.canvas.border,
    paddingVertical: 14,
    borderRadius: DS.radius.pill,
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: DS.text.primary,
  },
  dispatchNowButton: {
    width: '100%',
    backgroundColor: DS.accent.sos,
    paddingVertical: 14,
    borderRadius: DS.radius.pill,
    alignItems: 'center',
  },
  dispatchNowText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
