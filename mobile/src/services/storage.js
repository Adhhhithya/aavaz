import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const SESSION_KEY = '@auth_session_user';
let _memorySession = null;

export const storage = {
  async saveSession(sessionData) {
    _memorySession = sessionData;
    try {
      if (Platform.OS === 'web' && typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(SESSION_KEY, JSON.stringify(sessionData));
      } else {
        await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(sessionData));
      }
    } catch (e) {
      // Memory fallback is preserved
      console.warn('Failed to save secure session', e);
    }
  },

  async getSession() {
    if (_memorySession) return _memorySession;
    try {
      if (Platform.OS === 'web' && typeof window !== 'undefined' && window.localStorage) {
        const local = window.localStorage.getItem(SESSION_KEY);
        if (local) {
          _memorySession = JSON.parse(local);
          return _memorySession;
        }
      } else {
        const data = await SecureStore.getItemAsync(SESSION_KEY);
        if (data) {
          _memorySession = JSON.parse(data);
          return _memorySession;
        }
      }
    } catch (e) {
      // Memory fallback is preserved
      console.warn('Failed to get secure session', e);
    }
    return _memorySession;
  },

  async clearSession() {
    _memorySession = null;
    try {
      if (Platform.OS === 'web' && typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.removeItem(SESSION_KEY);
      } else {
        await SecureStore.deleteItemAsync(SESSION_KEY);
      }
    } catch (e) {
      console.warn('Failed to clear secure session', e);
    }
  },

  async updateProfile(profileUpdates) {
    try {
      const current = await this.getSession();
      if (current) {
        const updated = {
          ...current,
          user_profile: {
            ...(current.user_profile || {}),
            ...profileUpdates,
          },
          is_new_user: false,
        };
        await this.saveSession(updated);
        return updated;
      }
    } catch (e) {
      console.warn('Failed to update profile in storage', e);
    }
    return null;
  }
};
