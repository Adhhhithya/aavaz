/**
 * Centralized configuration module for the mobile application.
 * All environment variables should be accessed through this file.
 */
const DEFAULT_DEV_API_URL = 'https://desirae-nonfeldspathic-pinnately.ngrok-free.dev';
const DEFAULT_DEV_SUPABASE_URL = 'https://ojcjekoshcrjwmptzhdd.supabase.co';

const config = {
  apiUrl: (process.env.EXPO_PUBLIC_API_URL || DEFAULT_DEV_API_URL).trim(),
  supabaseUrl: (process.env.EXPO_PUBLIC_SUPABASE_URL || DEFAULT_DEV_SUPABASE_URL).trim(),
  supabaseAnonKey: (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '').trim(),
};

export default config;
