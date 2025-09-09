import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { supabase } from '@/utils/supabase';

interface User {
  id: string;
  phone: string;
  name: string;
  role: string;
  language: string;
  tenantId: string;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  
  // Actions
  login: (phone: string, otp: string) => Promise<void>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
  setUser: (user: User | null) => void;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,

      login: async (phone: string, otp: string) => {
        set({ isLoading: true, error: null });
        try {
          if (!supabase) {
            throw new Error('Supabase not configured. Please connect to Supabase first.');
          }
          
          // Implement OTP verification with Supabase
          const { data, error } = await supabase.auth.verifyOtp({
            phone,
            token: otp,
            type: 'sms',
          });

          if (error) throw error;

          // Fetch user details from database
          // This will be implemented when Supabase is connected
          set({ 
            isAuthenticated: true,
            isLoading: false,
          });
        } catch (error: any) {
          set({ 
            error: error.message || 'Login failed',
            isLoading: false,
          });
        }
      },

      logout: async () => {
        try {
          if (supabase) {
            await supabase.auth.signOut();
          }
          set({ 
            user: null, 
            isAuthenticated: false,
            error: null,
          });
        } catch (error: any) {
          set({ error: error.message });
        }
      },

      checkAuth: async () => {
        set({ isLoading: true });
        try {
          if (!supabase) {
            set({ isLoading: false });
            return;
          }

          const { data: { session } } = await supabase.auth.getSession();
          
          if (session) {
            // Fetch user details when connected to Supabase
            set({ 
              isAuthenticated: true,
              isLoading: false,
            });
          } else {
            set({ 
              isAuthenticated: false,
              isLoading: false,
            });
          }
        } catch (error) {
          set({ 
            isAuthenticated: false,
            isLoading: false,
          });
        }
      },

      setUser: (user) => set({ 
        user, 
        isAuthenticated: user !== null 
      }),
      clearError: () => set({ error: null }),
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({ 
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);