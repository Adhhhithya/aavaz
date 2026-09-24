import React from 'react';
import { StatusBar } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import ErrorBoundary from '../src/components/ErrorBoundary';
import { WarningModalProvider, showGlobalWarningModal, formatErrorMessage } from '../src/context/WarningModalContext';
import { DS } from '../src/theme/designSystem';

import { LogBox } from 'react-native';

LogBox.ignoreAllLogs(true);

if (typeof ErrorUtils !== 'undefined') {
  ErrorUtils.setGlobalHandler((error, isFatal) => {
    showGlobalWarningModal({
      title: 'Notice',
      message: formatErrorMessage(error),
      type: 'warning',
    });
    if (__DEV__) {
      console.warn('[GlobalErrorHandler intercepted]:', error?.message || error);
    }
  });
}

if (typeof global !== 'undefined') {
  global.onunhandledrejection = (event) => {
    const error = event?.reason || event;
    showGlobalWarningModal({
      title: 'Notice',
      message: formatErrorMessage(error),
      type: 'warning',
    });
  };
}
if (typeof window !== 'undefined') {
  window.onunhandledrejection = (event) => {
    if (event && event.preventDefault) event.preventDefault();
    const error = event?.reason || event;
    showGlobalWarningModal({
      title: 'Notice',
      message: formatErrorMessage(error),
      type: 'warning',
    });
  };
}

export default function RootLayout() {
  return (
    <ErrorBoundary onReset={() => { /* maybe router.replace('/login') */ }}>
      <WarningModalProvider>
        <SafeAreaProvider>
          <StatusBar barStyle="dark-content" backgroundColor={DS.canvas.base} />
          <Stack screenOptions={{ headerShown: false }} />
        </SafeAreaProvider>
      </WarningModalProvider>
    </ErrorBoundary>
  );
}
