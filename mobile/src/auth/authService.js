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

  async saveRegisteredSession(result, phone) {
    const session = {
      token: result.token,
      token_type: result.token_type || 'victim_session',
      phone: phone,
      is_new_user: false,
      userProfile: {
        id: result.id || result.user_id,
        name: result.fullName || result.name || '',
        fullName: result.fullName || result.name || '',
        phone: phone,
        case_id: result.case_id,
        age: result.age,
        emergencyContact: result.emergencyContact,
      },
    };

    setAuthToken(session.token);
    await storage.saveSession(session);
    return session;
  }

  async registerUser(registrationData, phoneVerifiedToken) {
    const payload = {
      name: registrationData.fullName || registrationData.name || '',
      role_type: registrationData.role_type || 'victim',
      consent_given: true,
      preferred_language: registrationData.preferred_language || 'en',
    };

    const res = await api.post('/api/v1/auth/register', payload, {
      authorization: phoneVerifiedToken,
    });

    const session = {
      token: res.token,
      token_type: res.token_type || 'victim_session',
      phone: registrationData.phone,
      is_new_user: false,
      userProfile: {
        id: res.user_id,
        case_id: res.case_id,
        name: payload.name,
        fullName: payload.name,
        phone: registrationData.phone,
        age: registrationData.age,
        emergencyContact: registrationData.emergencyContact,
      },
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
