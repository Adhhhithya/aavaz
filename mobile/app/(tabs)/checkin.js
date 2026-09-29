import React from 'react';
import CheckinScreen from '../../src/screens/CheckinScreen';
import { useRouter } from 'expo-router';

export default function CheckinTab() {
  const router = useRouter();

  return (
    <CheckinScreen 
      onComplete={() => {
        router.push('/(tabs)/home');
      }} 
    />
  );
}
