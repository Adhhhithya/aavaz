import React from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import RegisterScreen from '../../src/screens/RegisterScreen';
import { authService } from '../../src/auth/authService';
import { showGlobalWarningModal, formatErrorMessage } from '../../src/context/WarningModalContext';

export default function RegisterRoute() {
  const router = useRouter();
  const { phone, phoneVerifiedToken } = useLocalSearchParams();

  const handleCompleteOnboarding = async (result) => {
    try {
      await authService.saveRegisteredSession(result, phone);
      router.replace('/(tabs)/home');
    } catch (e) {
      console.error('Failed to complete onboarding:', e);
      showGlobalWarningModal({
        title: 'Registration Notice',
        message: formatErrorMessage(e),
        type: 'warning',
      });
    }
  };

  return (
    <RegisterScreen
      phoneNumber={phone}
      phoneVerifiedToken={phoneVerifiedToken}
      onCompleteSetup={handleCompleteOnboarding}
    />
  );
}
