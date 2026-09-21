import Constants from 'expo-constants';
import { Platform } from 'react-native';

import config from '../config';

function getApiBaseUrl() {
  return config.apiUrl;
}

export const API_BASE_URL = config.apiUrl;

// S2: the backend now enforces real victim authentication on victim-facing
// endpoints. This module-level token is attached as an Authorization header on
// every request once set. Call api.setAuthToken(token) after OTP verification
// or registration succeeds, and api.clearAuthToken() on logout.
let authToken = null;

export function setAuthToken(token) {
  authToken = token || null;
}

export function clearAuthToken() {
  authToken = null;
}

function buildHeaders(extra = {}) {
  const headers = {
    'Content-Type': 'application/json',
    'ngrok-skip-browser-warning': '1', // Important for bypassing free tier warnings
    ...extra,
  };
  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }
  return headers;
}

export const api = {
  get: async (endpoint) => {
    try {
      const baseUrl = getApiBaseUrl();
      const res = await fetch(`${baseUrl}${endpoint}`, {
        method: 'GET',
        headers: buildHeaders(),
      });
      if (!res.ok) throw new Error(`API Error: ${res.status}`);
      return await res.json();
    } catch (e) {
      console.error('GET Error', endpoint, e);
      throw e;
    }
  },

  post: async (endpoint, data, { authorization } = {}) => {
    try {
      const baseUrl = getApiBaseUrl();
      const res = await fetch(`${baseUrl}${endpoint}`, {
        method: 'POST',
        headers: buildHeaders(authorization ? { Authorization: `Bearer ${authorization}` } : {}),
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error(`API Error: ${res.status}`);
      return await res.json();
    } catch (e) {
      console.error('POST Error', endpoint, e);
      throw e;
    }
  },
};
