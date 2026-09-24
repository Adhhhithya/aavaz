import React from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import OTPVerificationScreen from '../../src/screens/OTPVerificationScreen';
import { authService } from '../../src/auth/authService';
import { showGlobalWarningModal, formatErrorMessage } from '../../src/context/WarningModalContext';

export default function OTPRoute() {
  const router = useRouter();
  const { countryCode, phoneNumber } = useLocalSearchParams();

  const handleVerifySuccess = async (otpCode) => {
    try {
      const formattedPhone = `${countryCode}${phoneNumber}`;
      const result = await authService.signIn(formattedPhone, otpCode);

      if (result.isNewUser) {
        router.push({
          pathname: '/(auth)/register',
          params: {
            phone: formattedPhone,
            phoneVerifiedToken: result.token,
          },
        });
        return;
      }

      router.replace('/(tabs)/home');
    } catch (e) {
      showGlobalWarningModal({
        title: 'Verification Notice',
        message: formatErrorMessage(e),
        type: 'warning',
      });
    }
  };

  return (
    <OTPVerificationScreen
      phoneNumber={phoneNumber}
      countryCode={countryCode}
      onEditPhone={() => router.back()}
      onVerifySuccess={handleVerifySuccess}
    />
  );
}
