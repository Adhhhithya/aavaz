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

async function parseErrorResponse(res) {
  let errorData = null;
  try {
    errorData = await res.json();
  } catch (_) {
    try {
      const text = await res.text();
      if (text) errorData = { message: text };
    } catch (__) {}
  }
  const message = errorData?.detail || errorData?.message || `API Error: ${res.status}`;
  const err = new Error(typeof message === 'string' ? message : JSON.stringify(message));
  err.status = res.status;
  err.data = errorData;
  return err;
}

export const api = {
  get: async (endpoint) => {
    try {
      const baseUrl = getApiBaseUrl();
      const res = await fetch(`${baseUrl}${endpoint}`, {
        method: 'GET',
        headers: buildHeaders(),
      });
      if (!res.ok) throw await parseErrorResponse(res);
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
      if (!res.ok) throw await parseErrorResponse(res);
      return await res.json();
    } catch (e) {
      console.error('POST Error', endpoint, e);
      throw e;
    }
  },

  put: async (endpoint, data, { authorization } = {}) => {
    try {
      const baseUrl = getApiBaseUrl();
      const res = await fetch(`${baseUrl}${endpoint}`, {
        method: 'PUT',
        headers: buildHeaders(authorization ? { Authorization: `Bearer ${authorization}` } : {}),
        body: JSON.stringify(data),
      });
      if (!res.ok) throw await parseErrorResponse(res);
      return await res.json();
    } catch (e) {
      console.error('PUT Error', endpoint, e);
      throw e;
    }
  },
};
