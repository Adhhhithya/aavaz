/**
 * Centralized configuration module for the frontend web application.
 * All environment variables should be accessed through this file.
 */

const config = {
  apiUrl: import.meta.env.VITE_API_URL,
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY,
};

export default config;
