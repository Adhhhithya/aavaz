import { storage } from '../services/storage';
import { api, setAuthToken, clearAuthToken } from '../services/api';

/**
 * Authoritative authentication service.
 * Mediates between API endpoints and local secure session storage.
 */
class AuthService {
  async restoreSession() {
    const session = await storage.getSession();
    if (session && session.token && session.token_type === 'victim_session') {
      setAuthToken(session.token);
      return session;
    }
    await this.signOut();
    return null;
  }

  async signIn(formattedPhone, otpCode) {
    const res = await api.post('/api/v1/auth/otp/verify', {
      phone_number: formattedPhone,
      code: otpCode,
    });

    if (res.is_new_user) {
      return { isNewUser: true, token: res.token, phone: formattedPhone };
    }

    const session = {
      token: res.token,
      token_type: res.token_type,
      phone: formattedPhone,
      is_new_user: false,
      userProfile: res.userProfile || { name: '', phone: formattedPhone },
    };

    setAuthToken(session.token);
    await storage.saveSession(session);
    return { isNewUser: false, session };
  }

  async registerUser(registrationData, phoneVerifiedToken) {
    const res = await api.post('/api/v1/auth/register', registrationData, {
      headers: {
        Authorization: `Bearer ${phoneVerifiedToken}`,
      },
    });

    const session = {
      token: res.token,
      token_type: res.token_type,
      phone: res.userProfile?.phone || registrationData.phone,
      is_new_user: false,
      userProfile: res.userProfile,
    };

    setAuthToken(session.token);
    await storage.saveSession(session);
    return session;
  }

  async signOut() {
    clearAuthToken();
    await storage.clearSession();
  }

  async getCurrentUser() {
    const session = await storage.getSession();
    return session ? session.userProfile : null;
  }
}

export const authService = new AuthService();
