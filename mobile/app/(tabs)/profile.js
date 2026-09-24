import React, { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import ProfileScreen from '../../src/screens/ProfileScreen';
import { authService } from '../../src/auth/authService';
import { storage } from '../../src/services/storage';

export default function ProfileRoute() {
  const router = useRouter();
  const [userProfile, setUserProfile] = useState(null);

  useEffect(() => {
    authService.getCurrentUser().then(user => {
      setUserProfile(user);
    });
  }, []);

  const handleLogout = async () => {
    await authService.signOut();
    router.replace('/(auth)/login');
  };

  const handleUpdateProfile = async (profileData) => {
    await storage.updateProfile(profileData);
    const updated = { ...userProfile, ...profileData };
    setUserProfile(updated);
  };

  return (
    <ProfileScreen
      user={{
        name: userProfile?.fullName || userProfile?.name,
        phone: userProfile?.phone,
        preferred_language: userProfile?.preferred_language,
      }}
      onLogout={handleLogout}
      onSaveProfile={handleUpdateProfile}
    />
  );
}
