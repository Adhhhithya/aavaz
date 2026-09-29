import React, { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import ProfileScreen from '../../src/screens/ProfileScreen';
import { authService } from '../../src/auth/authService';
import { storage } from '../../src/services/storage';

export default function ProfileRoute() {
  const router = useRouter();
  const [userProfile, setUserProfile] = useState(null);

  useEffect(() => {
    // 1. Initial quick load from local session
    authService.getCurrentUser().then(user => {
      if (user) setUserProfile(user);
    });
    // 2. Fetch fresh profile from backend
    authService.getProfile().then(user => {
      if (user) setUserProfile(user);
    });
  }, []);

  const handleLogout = async () => {
    await authService.signOut();
    router.replace('/(auth)/login');
  };

  const handleUpdateProfile = async (profileData) => {
    const updated = await authService.updateProfile(profileData);
    setUserProfile(updated || { ...userProfile, ...profileData });
  };

  const emContact = userProfile?.emergencyContact || {
    name: userProfile?.emergency_contact_name || '',
    phone: userProfile?.emergency_contact_phone || '',
  };

  return (
    <ProfileScreen
      user={{
        name: userProfile?.fullName || userProfile?.name || '',
        phone: userProfile?.phone || userProfile?.phone_number || '',
        preferred_language: userProfile?.preferred_language || 'en',
        age: userProfile?.age ? String(userProfile.age) : '',
        emergencyContact: emContact,
        emergency_contact_name: emContact.name,
        emergency_contact_phone: emContact.phone,
      }}
      onLogout={handleLogout}
      onSaveProfile={handleUpdateProfile}
    />
  );
}
