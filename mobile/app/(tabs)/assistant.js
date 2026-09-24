import React, { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import ChatbotScreen from '../../src/screens/ChatbotScreen';
import { authService } from '../../src/auth/authService';

export default function AssistantRoute() {
  const router = useRouter();
  const [userProfile, setUserProfile] = useState(null);

  useEffect(() => {
    authService.getCurrentUser().then(user => {
      setUserProfile(user);
    });
  }, []);

  return (
    <ChatbotScreen
      userProfile={userProfile}
      onDiscreetExit={() => router.navigate('/(tabs)/home')}
    />
  );
}
