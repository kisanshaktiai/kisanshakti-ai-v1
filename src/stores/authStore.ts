import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface User {
  id: string;
  phone: string;
  name: string;
  role: string;
  language: string;
  tenantId: string;
  farmerCode?: string;
  sessionToken?: string;
  lastLoginAt?: string;
  // Profile fields from user_profiles
  fullName?: string;
  displayName?: string;
  dateOfBirth?: string;
  gender?: string;
  village?: string;
  taluka?: string;
  district?: string;
  state?: string;
  pincode?: string;
  preferredLanguage?: string;
  // Farm details from farmers
  totalLandAcres?: number;
  primaryCrops?: string[];
  farmingExperienceYears?: number;
  farmType?: string;
  hasTractor?: boolean;
  hasIrrigation?: boolean;
  irrigationType?: string;
  hasStorage?: boolean;
  annualIncomeRange?: string;
}

interface Session {
  farmerId: string;
  tenantId: string;
  mobile: string;
  token: string;
  createdAt: string;
  expiresAt: string;
  isPinVerified: boolean;
}

interface AuthState {
  user: User | null;
  session: Session | null;
  isAuthenticated: boolean;
  isPinRequired: boolean;
  isLoading: boolean;
  error: string | null;
  
  // Actions
  setUser: (user: User | null) => void;
  setSession: (session: Session | null) => void;
  createSession: (farmerId: string, tenantId: string, mobile: string) => Session;
  validateSession: () => boolean;
  requirePin: () => void;
  logout: () => void;
  checkAuth: () => void;
  clearError: () => void;
}

// Generate a session token
const generateSessionToken = () => {
  return `session_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
};

// Session expires after 24 hours
const SESSION_DURATION = 24 * 60 * 60 * 1000;

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      session: null,
      isAuthenticated: false,
      isPinRequired: false,
      isLoading: false,
      error: null,

      setUser: (user) => {
        set({ 
          user, 
          isAuthenticated: user !== null 
        });
      },

      setSession: (session) => {
        console.log('Setting session in authStore:', session);
        set({ 
          session,
          isAuthenticated: session !== null && session.isPinVerified,
          isPinRequired: session !== null && !session.isPinVerified
        });
      },

      createSession: (farmerId, tenantId, mobile) => {
        const session: Session = {
          farmerId,
          tenantId,
          mobile,
          token: generateSessionToken(),
          createdAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + SESSION_DURATION).toISOString(),
          isPinVerified: false
        };
        
        set({ 
          session,
          isPinRequired: true,
          isAuthenticated: false 
        });
        
        return session;
      },

      validateSession: () => {
        const { session, user } = get();
        
        console.log('Validating session:', { session, user });
        
        if (!session) {
          set({ 
            isAuthenticated: false,
            isPinRequired: false 
          });
          return false;
        }

        // Check if session is expired
        const now = new Date();
        const expiresAt = new Date(session.expiresAt);
        
        if (now > expiresAt) {
          console.log('Session expired');
          // Session expired
          set({ 
            session: null,
            isAuthenticated: false,
            isPinRequired: false,
            user: null 
          });
          return false;
        }

        // Session is valid but needs PIN verification
        if (!session.isPinVerified) {
          console.log('Session needs PIN verification');
          set({ 
            isAuthenticated: false,
            isPinRequired: true 
          });
          return false;
        }

        // Session is valid and PIN verified - ensure we have user data
        if (session.isPinVerified && user) {
          console.log('Session is valid and PIN verified');
          set({ 
            isAuthenticated: true,
            isPinRequired: false 
          });
          return true;
        }
        
        return false;
      },

      requirePin: () => {
        const { session } = get();
        if (session) {
          set({
            session: {
              ...session,
              isPinVerified: false
            },
            isAuthenticated: false,
            isPinRequired: true
          });
        }
      },

      logout: () => {
        // Clear all auth data
        set({ 
          user: null,
          session: null,
          isAuthenticated: false,
          isPinRequired: false,
          error: null 
        });
        
        // Clear localStorage items
        localStorage.removeItem('authMobile');
        localStorage.removeItem('farmerId');
        localStorage.removeItem('tenantId');
      },

      checkAuth: () => {
        // Validate existing session on app load
        const { validateSession } = get();
        validateSession();
      },

      clearError: () => set({ error: null }),
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({ 
        user: state.user,
        session: state.session,
        isAuthenticated: state.isAuthenticated,
        isPinRequired: state.isPinRequired
      }),
    }
  )
);