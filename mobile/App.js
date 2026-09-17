import React, { useState, useEffect } from 'react';
import { View, StyleSheet, StatusBar, ActivityIndicator } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { DS } from './src/theme/designSystem';
import { storage } from './src/services/storage';

// Screens
import LoginScreen from './src/screens/LoginScreen';
import OTPVerificationScreen from './src/screens/OTPVerificationScreen';
import RegisterScreen from './src/screens/RegisterScreen';
import HomeScreen from './src/screens/HomeScreen';
import CaseLifecycleScreen from './src/screens/CaseLifecycleScreen';
import ChatbotScreen from './src/screens/ChatbotScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import BreathingScreen from './src/screens/BreathingScreen';

// Services
import { api, setAuthToken, clearAuthToken } from './src/services/api';

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
            onNavigateToBreathing={() => setActiveTab('Breathing')}
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
      case 'Breathing':
        return <BreathingScreen onNavigateBack={() => setActiveTab('Home')} />;
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
      const session = await storage.getSession();
      // S2: only a real victim_session token (issued after OTP verification or
      // registration) restores MainApp — a lingering phone_verified token (from
      // an interrupted registration) is not a session and must not be trusted.
      if (session && session.token && session.token_type === 'victim_session') {
        setAuthToken(session.token);
        setAuthData((prev) => ({ ...prev, ...session }));
        setCurrentScreen('MainApp');
      } else {
        await storage.clearSession();
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
      alert('Could not send a verification code. Please try again.');
    }
  };

  const handleVerifySuccess = async (otpCode) => {
    try {
      const formattedPhone = `${authData.countryCode}${authData.phoneNumber}`;
      const res = await api.post('/api/v1/auth/otp/verify', {
        phone_number: formattedPhone,
        code: otpCode,
      });

      const isNew = res.is_new_user;

      if (isNew) {
        // res.token is a short-lived phone-verified token, NOT a session — it
        // only authorizes the upcoming call to /register. It is deliberately
        // not persisted to storage.
        setAuthData((prev) => ({
          ...prev,
          phone: formattedPhone,
          is_new_user: true,
          phoneVerifiedToken: res.token,
        }));
        setCurrentScreen('Onboarding');
        return;
      }

      const session = {
        token: res.token,
        token_type: res.token_type,
        phone: formattedPhone,
        is_new_user: false,
        userProfile: res.userProfile || { name: '', phone: formattedPhone },
      };

      setAuthToken(res.token);
      await storage.saveSession(session);
      setAuthData((prev) => ({ ...prev, ...session }));
      setCurrentScreen('MainApp');
    } catch (e) {
      alert('Verification failed: incorrect or expired code.');
    }
  };

  const handleCompleteOnboarding = async (result) => {
    // RegisterScreen performs the actual POST /register call (it holds the
    // phone-verified token) and passes back the issued victim_session token.
    const session = {
      token: result.token,
      token_type: 'victim_session',
      phone: authData.phone,
      is_new_user: false,
      userProfile: {
        fullName: result.fullName,
        age: result.age,
        emergencyContact: result.emergencyContact,
        id: result.id,
        case_id: result.case_id,
        phone: authData.phone,
      },
    };
    setAuthToken(result.token);
    await storage.saveSession(session);
    setAuthData((prev) => ({ ...prev, ...session }));
    setCurrentScreen('MainApp');
  };

  const handleLogout = async () => {
    clearAuthToken();
    await storage.clearSession();
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
