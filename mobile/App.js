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
      if (session && session.token) {
        if (session.is_new_user) {
          setAuthData((prev) => ({ ...prev, ...session }));
          setCurrentScreen('Onboarding');
        } else {
          setAuthData((prev) => ({ ...prev, ...session }));
          setCurrentScreen('MainApp');
        }
      } else {
        setCurrentScreen('Login');
      }
    }
    checkSession();
  }, []);

  // Handlers
  const handleSendOTP = ({ countryCode, phoneNumber }) => {
    setAuthData((prev) => ({ ...prev, countryCode, phoneNumber }));
    setCurrentScreen('OTP');
  };

  const handleVerifySuccess = async (otpCode) => {
    try {
      const formattedPhone = `${authData.countryCode}${authData.phoneNumber}`;
      const res = await api.post('/api/v1/auth/verify_otp', { phone_number: formattedPhone });
      
      const isNew = res.is_new_user;
      
      const session = {
        token: 'mock_jwt_token_' + Date.now(), // Real auth would issue token here
        phone: formattedPhone,
        is_new_user: isNew,
        userProfile: res.userProfile || {
          name: '',
          phone: formattedPhone,
        },
      };

      await storage.saveSession(session);
      setAuthData((prev) => ({ ...prev, ...session }));

      if (isNew) {
        setCurrentScreen('Onboarding');
      } else {
        setCurrentScreen('MainApp');
      }
    } catch (e) {
      alert("Verification failed: " + e.message);
    }
  };

  const handleCompleteOnboarding = async (profileData) => {
    const updated = await storage.updateProfile(profileData);
    setAuthData((prev) => ({
      ...prev,
      userProfile: { ...(prev.userProfile || {}), ...profileData },
      is_new_user: false,
    }));
    setCurrentScreen('MainApp');
  };

  const handleLogout = async () => {
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
            phoneNumber={authData.countryCode + authData.phoneNumber}
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
