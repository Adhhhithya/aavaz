import React, { useEffect, useState } from 'react';
import { Tabs, useRouter, usePathname } from 'expo-router';
import FloatingTabBar from '../../src/components/FloatingTabBar';
import { authService } from '../../src/auth/authService';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import { DS } from '../../src/theme/designSystem';

export default function TabsLayout() {
  const router = useRouter();
  const pathname = usePathname();
  const [userProfile, setUserProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function checkAuth() {
      const session = await authService.restoreSession();
      if (!session) {
        router.replace('/(auth)/login');
      } else {
        setUserProfile(session.userProfile || session);
      }
      setLoading(false);
    }
    checkAuth();
  }, [router]);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={DS.primary.main} />
      </View>
    );
  }

  // Derive activeTab from pathname for FloatingTabBar
  let activeTab = 'Home';
  if (pathname.includes('cases')) activeTab = 'Cases';
  if (pathname.includes('assistant')) activeTab = 'Assistant';
  if (pathname.includes('profile')) activeTab = 'Profile';

  const handleTabPress = (tabId) => {
    switch (tabId) {
      case 'Home': router.navigate('/(tabs)/home'); break;
      case 'Cases': router.navigate('/(tabs)/cases'); break;
      case 'Assistant': router.navigate('/(tabs)/assistant'); break;
      case 'Profile': router.navigate('/(tabs)/profile'); break;
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: DS.canvas.base }}>
      <Tabs
        screenOptions={{
          headerShown: false,
          // Hide default tab bar
          tabBarStyle: { display: 'none' },
        }}
      >
        <Tabs.Screen name="home" />
        <Tabs.Screen name="cases" />
        <Tabs.Screen name="assistant" />
        <Tabs.Screen name="profile" />
      </Tabs>
      <FloatingTabBar activeTab={activeTab} onTabPress={handleTabPress} />
    </View>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: DS.canvas.base,
  },
});
