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

    const rawProfile = res.userProfile || {};
    const normalizedPhone = rawProfile.phone || rawProfile.phone_number || formattedPhone;
    const session = {
      token: res.token,
      token_type: res.token_type,
      phone: normalizedPhone,
      is_new_user: false,
      userProfile: {
        id: rawProfile.id,
        name: rawProfile.name || rawProfile.fullName || '',
        fullName: rawProfile.name || rawProfile.fullName || '',
        phone: normalizedPhone,
        phone_number: normalizedPhone,
        preferred_language: rawProfile.preferred_language || 'en',
        age: rawProfile.age || '',
        emergencyContact: rawProfile.emergencyContact || {
          name: rawProfile.emergency_contact_name || '',
          phone: rawProfile.emergency_contact_phone || '',
        },
      },
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
        phone_number: phone,
        case_id: result.case_id,
        age: result.age || '',
        preferred_language: result.preferred_language || 'en',
        emergencyContact: result.emergencyContact || {
          name: result.emergency_contact_name || '',
          phone: result.emergency_contact_phone || '',
        },
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
      emergencyContact: registrationData.emergencyContact,
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
        phone_number: registrationData.phone,
        age: registrationData.age || '',
        preferred_language: payload.preferred_language,
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
    return session ? (session.userProfile || session.user_profile) : null;
  }

  async getProfile() {
    try {
      const res = await api.get('/api/v1/auth/profile');
      if (res && res.status === 'success' && res.user) {
        const p = res.user;
        const normalizedPhone = p.phone || p.phone_number || '';
        const userProfile = {
          id: p.id,
          name: p.name || p.fullName || '',
          fullName: p.name || p.fullName || '',
          phone: normalizedPhone,
          phone_number: normalizedPhone,
          preferred_language: p.preferred_language || 'en',
          age: p.age || '',
          emergencyContact: p.emergencyContact || {
            name: p.emergency_contact_name || '',
            phone: p.emergency_contact_phone || '',
          },
        };
        await storage.updateProfile(userProfile);
        return userProfile;
      }
    } catch (e) {
      console.warn('Could not fetch remote profile, falling back to local session', e);
    }
    return this.getCurrentUser();
  }

  async updateProfile(profileData) {
    try {
      const res = await api.put('/api/v1/auth/profile', {
        name: profileData.name,
        preferred_language: profileData.preferred_language || profileData.language,
        age: profileData.age ? String(profileData.age) : undefined,
        emergencyContact: profileData.emergencyContact,
        emergency_contact_name: profileData.emergencyContact?.name,
        emergency_contact_phone: profileData.emergencyContact?.phone,
      });
      if (res && res.status === 'success' && res.user) {
        const p = res.user;
        const normalizedPhone = p.phone || p.phone_number || '';
        const userProfile = {
          id: p.id,
          name: p.name || p.fullName || '',
          fullName: p.name || p.fullName || '',
          phone: normalizedPhone,
          phone_number: normalizedPhone,
          preferred_language: p.preferred_language || 'en',
          age: p.age || profileData.age || '',
          emergencyContact: p.emergencyContact || profileData.emergencyContact,
        };
        await storage.updateProfile(userProfile);
        return userProfile;
      }
    } catch (e) {
      console.warn('Remote update failed, updating local storage only', e);
    }
    await storage.updateProfile(profileData);
    return this.getCurrentUser();
  }
}

export const authService = new AuthService();
