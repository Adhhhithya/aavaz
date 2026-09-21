import React, { useState, useEffect } from 'react';
import { View, StyleSheet, StatusBar, ActivityIndicator } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { DS } from './src/theme/designSystem';
import { storage } from './src/services/storage';
import { authService } from './src/auth/authService';

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
      alert('Could not send a verification code. Please try again.');
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
      alert('Verification failed: incorrect or expired code.');
    }
  };

  const handleCompleteOnboarding = async (result) => {
    // result contains token and token_type 'victim_session'
    const session = await authService.registerUser(
      {
        fullName: result.fullName,
        age: result.age,
        emergencyContact: result.emergencyContact,
        phone: authData.phone,
      },
      authData.phoneVerifiedToken
    );
    setAuthData((prev) => ({ ...prev, ...session }));
    setCurrentScreen('MainApp');
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
