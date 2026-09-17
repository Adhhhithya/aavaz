// mobile/src/services/api.js

// IMPORTANT: Replace this with your actual local IP (e.g. 192.168.1.X) or Ngrok URL when testing on a real device.
const NGROK_URL = 'http://10.0.2.2:8000'; // Default for Android Emulator
export const API_BASE_URL = NGROK_URL;

const defaultHeaders = {
  'Content-Type': 'application/json',
  'ngrok-skip-browser-warning': '1', // Important for bypassing free tier warnings
};

export const api = {
  get: async (endpoint) => {
    try {
      const res = await fetch(`${NGROK_URL}${endpoint}`, {
        method: 'GET',
        headers: defaultHeaders,
      });
      if (!res.ok) throw new Error(`API Error: ${res.status}`);
      return await res.json();
    } catch (e) {
      console.error('GET Error', endpoint, e);
      throw e;
    }
  },
  
  post: async (endpoint, data) => {
    try {
      const res = await fetch(`${NGROK_URL}${endpoint}`, {
        method: 'POST',
        headers: defaultHeaders,
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
