import React, { useEffect, useState, useCallback } from 'react';
import { useRouter, useFocusEffect } from 'expo-router';
import HomeScreen from '../../src/screens/HomeScreen';
import { authService } from '../../src/auth/authService';
import { api } from '../../src/services/api';

export default function HomeRoute() {
  const router = useRouter();
  const [userProfile, setUserProfile] = useState(null);

  const [score, setScore] = useState(0);

  const fetchScore = async (user) => {
    if (!user?.id) return;
    try {
      const res = await api.get(`/api/v1/intake/app/cases/${user.id}`);
      if (res && res.cases && res.cases.length > 0) {
        // Find the active case, or the most recent one
        const activeCase = res.cases.find(c => c.status === 'active') || res.cases[0];
        setScore(activeCase.current_distress_score || 0);
      }
    } catch (e) {
      console.error('Failed to fetch score for home screen', e);
    }
  };

  useEffect(() => {
    authService.getCurrentUser().then(user => {
      setUserProfile(user);
      fetchScore(user);
    });
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (userProfile) {
        fetchScore(userProfile);
      }
    }, [userProfile])
  );

  return (
    <HomeScreen
      userName={userProfile?.fullName || userProfile?.name || 'User'}
      userProfile={userProfile}
      score={score}
      onNavigateToCases={() => router.navigate('/(tabs)/cases')}
      onNavigateToAssistant={() => router.navigate('/(tabs)/assistant')}
    />
  );
}
