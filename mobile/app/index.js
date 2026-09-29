import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { authService } from '../src/auth/authService';
import { DS } from '../src/theme/designSystem';

export default function Index() {
  const router = useRouter();

  useEffect(() => {
    async function checkSession() {
      const session = await authService.restoreSession();
      if (session) {
        // We'll set up (tabs)/home next
        router.replace('/(tabs)/home');
      } else {
        router.replace('/(auth)/login');
      }
    }
    checkSession();
  }, [router]);

  return (
    <View style={styles.loadingContainer}>
      <ActivityIndicator size="large" color={DS.primary.main} />
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
