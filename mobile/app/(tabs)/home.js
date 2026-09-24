import React, { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import HomeScreen from '../../src/screens/HomeScreen';
import { authService } from '../../src/auth/authService';

export default function HomeRoute() {
  const router = useRouter();
  const [userProfile, setUserProfile] = useState(null);

  useEffect(() => {
    authService.getCurrentUser().then(user => {
      setUserProfile(user);
    });
  }, []);

  return (
    <HomeScreen
      userName={userProfile?.fullName || userProfile?.name || 'User'}
      userProfile={userProfile}
      onNavigateToCases={() => router.navigate('/(tabs)/cases')}
      onNavigateToAssistant={() => router.navigate('/(tabs)/assistant')}
    />
  );
}
