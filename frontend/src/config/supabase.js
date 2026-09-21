import { createClient } from '@supabase/supabase-js';
import config from './index.js';

if (!config.supabaseUrl || !config.supabaseAnonKey) {
  throw new Error("Missing Supabase configuration in Vite environment variables.");
}

export const supabase = createClient(config.supabaseUrl, config.supabaseAnonKey);
