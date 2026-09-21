import React, { useState, useEffect } from 'react';
import { View, StyleSheet, StatusBar, ActivityIndicator } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { DS } from './src/theme/designSystem';
import { storage } from './src/services/storage';
import { authService } from './src/auth/authService';
import ErrorBoundary from './src/components/ErrorBoundary';
import {
  WarningModalProvider,
  showGlobalWarningModal,
  formatErrorMessage,
} from './src/context/WarningModalContext';

import { LogBox } from 'react-native';

// Suppress all React Native / Expo red and yellow box error overlays
LogBox.ignoreAllLogs(true);

// Intercept all unhandled JavaScript exceptions in React Native / Expo
// Prevents red screens and displays the graceful Warning Modal instead
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

// Intercept all unhandled Promise rejections
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

// Screens
import LoginScreen from './src/screens/LoginScreen';
import OTPVerificationScreen from './src/screens/OTPVerificationScreen';
import RegisterScreen from './src/screens/RegisterScreen';
import HomeScreen from './src/screens/HomeScreen';
import CaseLifecycleScreen from './src/screens/CaseLifecycleScreen';
import ChatbotScreen from './src/screens/ChatbotScreen';
import ProfileScreen from './src/screens/ProfileScreen';

// Services
import { api } from './src/services/api';

// Navigation components
import FloatingTabBar from './src/components/FloatingTabBar';

function MainAppShell({ userProfile, onLogout, onUpdateProfile }) {
  const [activeTab, setActiveTab] = useState('Home');

  const renderActiveTab = () => {
    switch (activeTab) {
      case 'Home':
        return (
          <HomeScreen
            userName={userProfile?.fullName || userProfile?.name || 'User'}
            userProfile={userProfile}
            onNavigateToCases={() => setActiveTab('Cases')}
            onNavigateToAssistant={() => setActiveTab('Assistant')}
          />
        );
      case 'Cases':
        return <CaseLifecycleScreen userProfile={userProfile} />;
      case 'Assistant':
        return (
          <ChatbotScreen
            userProfile={userProfile}
            onDiscreetExit={() => setActiveTab('Home')}
          />
        );
      case 'Profile':
        return (
          <ProfileScreen
            user={{
              name: userProfile?.fullName || userProfile?.name,
              phone: userProfile?.phone,
              preferred_language: userProfile?.preferred_language,
            }}
            onLogout={onLogout}
            onSaveProfile={onUpdateProfile}
          />
        );
      default:
        return <HomeScreen />;
    }
  };

  return (
    <View style={styles.mainContainer}>
      {renderActiveTab()}
      <FloatingTabBar activeTab={activeTab} onTabPress={setActiveTab} />
    </View>
  );
}

export default function App() {
  const [currentScreen, setCurrentScreen] = useState('Loading'); // 'Login' | 'OTP' | 'Onboarding' | 'MainApp'
  const [authData, setAuthData] = useState({
    countryCode: '+91',
    phoneNumber: '',
    userProfile: null,
  });

  // Session Persistence Check on Launch
  useEffect(() => {
    async function checkSession() {
      const session = await authService.restoreSession();
      if (session) {
        setAuthData((prev) => ({ ...prev, ...session }));
        setCurrentScreen('MainApp');
      } else {
        setCurrentScreen('Login');
      }
    }
    checkSession();
  }, []);

  // Handlers
  const handleSendOTP = async ({ countryCode, phoneNumber }) => {
    const formattedPhone = `${countryCode}${phoneNumber}`;
    try {
      await api.post('/api/v1/auth/otp/request', { phone_number: formattedPhone });
      setAuthData((prev) => ({ ...prev, countryCode, phoneNumber }));
      setCurrentScreen('OTP');
    } catch (e) {
      showGlobalWarningModal({
        title: 'Unable to Send Code',
        message: formatErrorMessage(e),
        type: 'warning',
      });
    }
  };

  const handleVerifySuccess = async (otpCode) => {
    try {
      const formattedPhone = `${authData.countryCode}${authData.phoneNumber}`;
      const result = await authService.signIn(formattedPhone, otpCode);

      if (result.isNewUser) {
        setAuthData((prev) => ({
          ...prev,
          phone: formattedPhone,
          is_new_user: true,
          phoneVerifiedToken: result.token,
        }));
        setCurrentScreen('Onboarding');
        return;
      }

      setAuthData((prev) => ({ ...prev, ...result.session }));
      setCurrentScreen('MainApp');
    } catch (e) {
      showGlobalWarningModal({
        title: 'Verification Notice',
        message: formatErrorMessage(e),
        type: 'warning',
      });
    }
  };

  const handleCompleteOnboarding = async (result) => {
    try {
      const session = await authService.saveRegisteredSession(result, authData.phone);
      setAuthData((prev) => ({ ...prev, ...session }));
      setCurrentScreen('MainApp');
    } catch (e) {
      console.error('Failed to complete onboarding:', e);
      showGlobalWarningModal({
        title: 'Registration Notice',
        message: formatErrorMessage(e),
        type: 'warning',
      });
    }
  };

  const handleLogout = async () => {
    await authService.signOut();
    setAuthData({
      countryCode: '+91',
      phoneNumber: '',
      userProfile: null,
    });
    setCurrentScreen('Login');
  };

  const handleUpdateProfile = async (profileData) => {
    await storage.updateProfile(profileData);
    setAuthData((prev) => ({
      ...prev,
      userProfile: { ...(prev.userProfile || {}), ...profileData },
    }));
  };

  return (
    <ErrorBoundary onReset={() => setCurrentScreen('Login')}>
      <WarningModalProvider>
        <SafeAreaProvider>
          <StatusBar barStyle="dark-content" backgroundColor={DS.canvas.base} />
          <View style={styles.root}>
            {currentScreen === 'Loading' && (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={DS.primary.main} />
              </View>
            )}

            {currentScreen === 'Login' && (
              <LoginScreen onSendOTP={handleSendOTP} />
            )}

            {currentScreen === 'OTP' && (
              <OTPVerificationScreen
                phoneNumber={authData.phoneNumber}
                countryCode={authData.countryCode}
                onEditPhone={() => setCurrentScreen('Login')}
                onVerifySuccess={handleVerifySuccess}
              />
            )}

            {currentScreen === 'Onboarding' && (
              <RegisterScreen
                phoneNumber={authData.phone}
                phoneVerifiedToken={authData.phoneVerifiedToken}
                onCompleteSetup={handleCompleteOnboarding}
              />
            )}

            {currentScreen === 'MainApp' && (
              <MainAppShell
                userProfile={authData.userProfile}
                onLogout={handleLogout}
                onUpdateProfile={handleUpdateProfile}
              />
            )}
          </View>
        </SafeAreaProvider>
      </WarningModalProvider>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: DS.canvas.base, // Cloud Mist #F8F9FC
  },
  mainContainer: {
    flex: 1,
    backgroundColor: DS.canvas.base,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: DS.canvas.base,
  },
});
