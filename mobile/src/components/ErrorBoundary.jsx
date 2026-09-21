import React from 'react';
import { View, Text, StyleSheet, SafeAreaView } from 'react-native';
import { ShieldAlert, RefreshCw } from 'lucide-react-native';
import { DS } from '../theme/designSystem';
import HapticButton from './HapticButton';

/**
 * Top-level React Error Boundary.
 * Catches unhandled render errors and prevents Expo from presenting
 * raw red error screens. Displays a calm, trauma-informed recovery view.
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    // Log safely without leaking raw user PII
    if (__DEV__) {
      console.warn('Caught by ErrorBoundary:', error?.message);
    }
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    this.props.onReset?.();
  };

  render() {
    if (this.state.hasError) {
      return (
        <SafeAreaView style={styles.container}>
          <View style={styles.content}>
            <View style={styles.iconCircle}>
              <ShieldAlert size={40} color={DS.accent.sos} />
            </View>

            <Text style={styles.title}>We encountered a brief pause</Text>
            <Text style={styles.subtitle}>
              Your session and records are completely safe. A minor display issue
              occurred, but no data was lost.
            </Text>

            <HapticButton
              title="Return to Safety"
              onPress={this.handleReset}
              variant="primary"
              style={styles.button}
              icon={<RefreshCw size={18} color={DS.text.light} style={{ marginRight: 8 }} />}
            />
          </View>
        </SafeAreaView>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: DS.canvas.base,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    paddingHorizontal: DS.spacing.xl,
    alignItems: 'center',
    maxWidth: 360,
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: DS.radius.full,
    backgroundColor: DS.accent.sosBg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: DS.spacing.lg,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: DS.text.primary,
    textAlign: 'center',
    marginBottom: DS.spacing.sm,
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 15,
    color: DS.text.secondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: DS.spacing.xl,
  },
  button: {
    width: '100%',
    height: 50,
    backgroundColor: DS.primary.main,
    borderRadius: DS.radius.pill,
  },
});
