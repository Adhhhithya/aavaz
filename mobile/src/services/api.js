// mobile/src/services/api.js

// IMPORTANT: Replace this with your actual local IP (e.g. 192.168.1.X) or Ngrok URL when testing on a real device.
const NGROK_URL = 'http://192.168.1.6:8000'; // PC's Wi-Fi LAN IP — phone must be on the same Wi-Fi network
export const API_BASE_URL = NGROK_URL;

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
      const res = await fetch(`${NGROK_URL}${endpoint}`, {
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
      const res = await fetch(`${NGROK_URL}${endpoint}`, {
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
