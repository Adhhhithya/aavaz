import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { Alert } from 'react-native';
import WarningModal from '../components/WarningModal';

const WarningModalContext = createContext({
  showWarning: () => {},
  showError: () => {},
  showSuccess: () => {},
  hideWarning: () => {},
});

// Singleton reference allowing non-React files (like api.js or ErrorUtils) to trigger the modal
let globalShowWarning = null;

import { formatErrorMessage as formatErrorMessageUtil } from '../utils/formatErrorMessage';

export function formatErrorMessage(error) {
  return formatErrorMessageUtil(error);
}

export function WarningModalProvider({ children }) {
  const [modalConfig, setModalConfig] = useState({
    visible: false,
    title: 'Notice',
    message: '',
    type: 'warning',
    buttonText: 'Understood',
    onConfirm: null,
    secondaryText: null,
    onSecondary: null,
  });

  const showWarning = useCallback((options = {}) => {
    setModalConfig({
      visible: true,
      title: options.title || 'Important Notice',
      message: options.message || '',
      type: options.type || 'warning',
      buttonText: options.buttonText || 'Understood',
      onConfirm: options.onConfirm || null,
      secondaryText: options.secondaryText || null,
      onSecondary: options.onSecondary || null,
    });
  }, []);

  const showError = useCallback((errorOrMessage, customTitle) => {
    const message = formatErrorMessage(errorOrMessage);
    showWarning({
      title: customTitle || 'Unable to Complete',
      message,
      type: 'error',
      buttonText: 'Understood',
    });
  }, [showWarning]);

  const showSuccess = useCallback((message, customTitle) => {
    showWarning({
      title: customTitle || 'Success',
      message,
      type: 'success',
      buttonText: 'Done',
    });
  }, [showWarning]);

  const hideWarning = useCallback(() => {
    setModalConfig((prev) => ({ ...prev, visible: false }));
  }, []);

  // Register global singleton
  useEffect(() => {
    globalShowWarning = showWarning;

    // Gracefully hijack React Native's Alert.alert and window.alert
    // so ANY legacy alert calls in dependencies/screens automatically render our modal
    const originalAlert = Alert.alert;
    Alert.alert = (title, message, buttons) => {
      let primaryBtn = null;
      let secondaryBtn = null;

      if (Array.isArray(buttons) && buttons.length > 0) {
        if (buttons.length === 1) {
          primaryBtn = buttons[0];
        } else {
          secondaryBtn = buttons[0];
          primaryBtn = buttons[1];
        }
      }

      showWarning({
        title: title || 'Notice',
        message: message || '',
        type: (title || '').toLowerCase().includes('error') ? 'error' : 'warning',
        buttonText: primaryBtn?.text || 'Understood',
        onConfirm: primaryBtn?.onPress || null,
        secondaryText: secondaryBtn?.text || null,
        onSecondary: secondaryBtn?.onPress || null,
      });
    };

    if (typeof window !== 'undefined') {
      window.alert = (msg) => {
        showWarning({
          title: 'Notice',
          message: String(msg),
          type: 'warning',
          buttonText: 'Understood',
        });
      };
    }

    if (typeof global !== 'undefined') {
      global.alert = (msg) => {
        showWarning({
          title: 'Notice',
          message: String(msg),
          type: 'warning',
          buttonText: 'Understood',
        });
      };
    }

    const prevGlobalRejection = typeof global !== 'undefined' ? global.onunhandledrejection : null;
    const prevWindowRejection = typeof window !== 'undefined' ? window.onunhandledrejection : null;

    if (typeof global !== 'undefined') {
      global.onunhandledrejection = (event) => {
        const error = event?.reason || event;
        showWarning({
          title: 'Notice',
          message: formatErrorMessage(error),
          type: 'warning',
          buttonText: 'Understood',
        });
      };
    }

    if (typeof window !== 'undefined') {
      window.onunhandledrejection = (event) => {
        if (event && event.preventDefault) event.preventDefault();
        const error = event?.reason || event;
        showWarning({
          title: 'Notice',
          message: formatErrorMessage(error),
          type: 'warning',
          buttonText: 'Understood',
        });
      };
    }

    return () => {
      Alert.alert = originalAlert;
      if (typeof global !== 'undefined') global.onunhandledrejection = prevGlobalRejection;
      if (typeof window !== 'undefined') window.onunhandledrejection = prevWindowRejection;
      globalShowWarning = null;
    };
  }, [showWarning]);

  return (
    <WarningModalContext.Provider
      value={{
        showWarning,
        showError,
        showSuccess,
        hideWarning,
      }}
    >
      {children}
      <WarningModal
        visible={modalConfig.visible}
        title={modalConfig.title}
        message={modalConfig.message}
        type={modalConfig.type}
        buttonText={modalConfig.buttonText}
        onConfirm={modalConfig.onConfirm}
        secondaryText={modalConfig.secondaryText}
        onSecondary={modalConfig.onSecondary}
        onClose={hideWarning}
      />
    </WarningModalContext.Provider>
  );
}

/**
 * Hook to use warning modal from any React component
 */
export function useWarningModal() {
  const context = useContext(WarningModalContext);
  if (!context) {
    return {
      showWarning: (opts) => globalShowWarning?.(opts),
      showError: (err, title) => globalShowWarning?.({ title: title || 'Notice', message: formatErrorMessage(err), type: 'error' }),
      showSuccess: (msg, title) => globalShowWarning?.({ title: title || 'Success', message: msg, type: 'success' }),
      hideWarning: () => {},
    };
  }
  return context;
}

/**
 * Callable from outside React components (e.g. api.js, error boundaries)
 */
export function showGlobalWarningModal(options = {}) {
  if (globalShowWarning) {
    globalShowWarning(options);
  }
}
