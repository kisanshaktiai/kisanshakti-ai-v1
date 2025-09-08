import { createClient } from '@supabase/supabase-js';

// These will be populated when you connect to Supabase
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const supabase = supabaseUrl && supabaseAnonKey 
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

// Helper to check if Supabase is configured
export const isSupabaseConfigured = () => {
  return !!supabaseUrl && !!supabaseAnonKey;
};

// Database types will be generated when connected to Supabase
export type Database = {
  public: {
    Tables: {
      tenants: {
        Row: {
          id: string;
          domain: string;
          name: string;
          theme: any;
          settings: any;
          created_at: string;
          updated_at: string;
        };
      };
      users: {
        Row: {
          id: string;
          tenant_id: string;
          phone: string;
          name: string;
          language: string;
          role: string;
          metadata: any;
          created_at: string;
        };
      };
    };
  };
};