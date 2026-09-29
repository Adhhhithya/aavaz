import React from 'react';
import { View, Text, StyleSheet, SafeAreaView } from 'react-native';
import FallbackScreen from './FallbackScreen';

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
        <FallbackScreen 
          type="500" 
          onAction={this.handleReset} 
          customTitle="We encountered a brief pause"
          customSubtitle="Your session and records are completely safe. A minor display issue occurred, but no data was lost."
          customActionText="Return to Safety"
        />
      );
    }

    return this.props.children;
  }
}
