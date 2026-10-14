import Constants from 'expo-constants';
import { Platform } from 'react-native';

import config from '../config';

function getApiBaseUrl() {
  const url = (config.apiUrl || 'https://desirae-nonfeldspathic-pinnately.ngrok-free.dev').trim();
  return url.replace(/\/+$/, '');
}

function getFullUrl(endpoint) {
  const baseUrl = getApiBaseUrl();
  const path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  const full = `${baseUrl}${path}`;
  if (!full.startsWith('http://') && !full.startsWith('https://')) {
    throw new Error(`Invalid API URL: "${full}". Must begin with http:// or https://`);
  }
  return full;
}

export const API_BASE_URL = getApiBaseUrl();

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

export function getAuthToken() {
  return authToken;
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

function httpRequest(url, { method = 'GET', headers = {}, body = null, timeout = 15000 } = {}) {
  // Use XMLHttpRequest if available (standard in React Native / Expo environment)
  if (typeof XMLHttpRequest !== 'undefined') {
    return new Promise((resolve, reject) => {
      try {
        const xhr = new XMLHttpRequest();
        xhr.open(method, url, true);
        xhr.timeout = timeout;

        for (const [key, value] of Object.entries(headers)) {
          if (value !== undefined && value !== null) {
            xhr.setRequestHeader(key, String(value));
          }
        }

        xhr.onload = () => {
          let data = null;
          const text = xhr.responseText;
          if (text) {
            try {
              data = JSON.parse(text);
            } catch (_) {
              data = { message: text };
            }
          }
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve(data);
          } else {
            const message = data?.detail || data?.message || `API Error: ${xhr.status}`;
            const err = new Error(typeof message === 'string' ? message : JSON.stringify(message));
            err.status = xhr.status;
            err.data = data;
            reject(err);
          }
        };

        xhr.onerror = () => {
          const err = new Error(`Cannot reach server at ${url}. Please verify internet or server connection.`);
          err.status = 0;
          reject(err);
        };

        xhr.ontimeout = () => {
          const err = new Error(`Request timed out after ${timeout}ms.`);
          err.status = 408;
          reject(err);
        };

        xhr.send(body);
      } catch (e) {
        reject(e);
      }
    });
  }

  // Headless environment / fallback using fetch with AbortController
  return (async () => {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timeoutId = controller ? setTimeout(() => controller.abort(), timeout) : null;
    try {
      const res = await fetch(url, {
        method,
        headers,
        body,
        signal: controller ? controller.signal : undefined,
      });
      let data = null;
      try {
        data = await res.json();
      } catch (_) {
        try {
          const text = await res.text();
          if (text) data = { message: text };
        } catch (__) {}
      }
      if (!res.ok) {
        const message = data?.detail || data?.message || `API Error: ${res.status}`;
        const err = new Error(typeof message === 'string' ? message : JSON.stringify(message));
        err.status = res.status;
        err.data = data;
        throw err;
      }
      return data;
    } catch (err) {
      if (err.name === 'AbortError') {
        const timeoutErr = new Error(`Request timed out after ${timeout}ms.`);
        timeoutErr.status = 408;
        throw timeoutErr;
      }
      throw err;
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  })();
}

export const api = {
  get: async (endpoint, { authorization, timeout } = {}) => {
    try {
      const url = getFullUrl(endpoint);
      return await httpRequest(url, {
        method: 'GET',
        headers: buildHeaders(authorization ? { Authorization: `Bearer ${authorization}` } : {}),
        timeout,
      });
    } catch (e) {
      console.error('GET Error', endpoint, e);
      throw e;
    }
  },

  post: async (endpoint, data, { authorization, timeout } = {}) => {
    try {
      const url = getFullUrl(endpoint);
      return await httpRequest(url, {
        method: 'POST',
        headers: buildHeaders(authorization ? { Authorization: `Bearer ${authorization}` } : {}),
        body: data !== undefined && data !== null ? JSON.stringify(data) : null,
        timeout,
      });
    } catch (e) {
      console.error('POST Error', endpoint, e);
      throw e;
    }
  },

  put: async (endpoint, data, { authorization, timeout } = {}) => {
    try {
      const url = getFullUrl(endpoint);
      return await httpRequest(url, {
        method: 'PUT',
        headers: buildHeaders(authorization ? { Authorization: `Bearer ${authorization}` } : {}),
        body: data !== undefined && data !== null ? JSON.stringify(data) : null,
        timeout,
      });
    } catch (e) {
      console.error('PUT Error', endpoint, e);
      throw e;
    }
  },

  delete: async (endpoint, { authorization, timeout } = {}) => {
    try {
      const url = getFullUrl(endpoint);
      return await httpRequest(url, {
        method: 'DELETE',
        headers: buildHeaders(authorization ? { Authorization: `Bearer ${authorization}` } : {}),
        timeout,
      });
    } catch (e) {
      console.error('DELETE Error', endpoint, e);
      throw e;
    }
  },
};
