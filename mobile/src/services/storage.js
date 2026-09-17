import AsyncStorage from '@react-native-async-storage/async-storage';

const SESSION_KEY = '@auth_session_user';

export const storage = {
  async saveSession(sessionData) {
    try {
      await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(sessionData));
    } catch (e) {
      console.warn('Failed to save session to AsyncStorage', e);
    }
  },

  async getSession() {
    try {
      const data = await AsyncStorage.getItem(SESSION_KEY);
      return data ? JSON.parse(data) : null;
    } catch (e) {
      console.warn('Failed to read session from AsyncStorage', e);
      return null;
    }
  },

  async clearSession() {
    try {
      await AsyncStorage.removeItem(SESSION_KEY);
    } catch (e) {
      console.warn('Failed to clear session', e);
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
