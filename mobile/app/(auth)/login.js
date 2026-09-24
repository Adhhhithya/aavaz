import React from 'react';
import { useRouter } from 'expo-router';
import LoginScreen from '../../src/screens/LoginScreen';
import { api } from '../../src/services/api';
import { showGlobalWarningModal, formatErrorMessage } from '../../src/context/WarningModalContext';

export default function LoginRoute() {
  const router = useRouter();

  const handleSendOTP = async ({ countryCode, phoneNumber }) => {
    const formattedPhone = `${countryCode}${phoneNumber}`;
    try {
      await api.post('/api/v1/auth/otp/request', { phone_number: formattedPhone });
      router.push({
        pathname: '/(auth)/otp',
        params: { countryCode, phoneNumber },
      });
    } catch (e) {
      showGlobalWarningModal({
        title: 'Unable to Send Code',
        message: formatErrorMessage(e),
        type: 'warning',
      });
    }
  };

  return <LoginScreen onSendOTP={handleSendOTP} />;
}
