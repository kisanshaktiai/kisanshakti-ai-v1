import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { setGlobalAuthData, updateSupabaseHeaders, clearGlobalAuthData } from '@/integrations/supabase/client';

interface User {
  id: string;
  phone: string;
  name: string;
  role: string;
  language: string;
  tenantId: string;
  farmerCode?: string;
  farmerName?: string;
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
  avatarUrl?: string;
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
  isOffline?: boolean;
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

// Session expires after 24 hours for online, 7 days for offline
const SESSION_DURATION = 24 * 60 * 60 * 1000;
const OFFLINE_SESSION_DURATION = 7 * 24 * 60 * 60 * 1000;

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
        
        // Update global auth data IMMEDIATELY when user is set
        if (user?.id && user?.tenantId) {
          setGlobalAuthData(user.id, user.tenantId);
          updateSupabaseHeaders(user.id, user.tenantId);
          console.log('✅ [Auth] Global auth data set IMMEDIATELY on setUser');
        }
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
        console.log('🚪 [Auth] Logging out - clearing auth data');
        
        // Reset headers state IMMEDIATELY
        clearGlobalAuthData();
        
        // Clear all auth data
        set({ 
          user: null,
          session: null,
          isAuthenticated: false,
          isPinRequired: false,
          error: null 
        });
        
        // Clear localStorage items - but NOT tenantId (it's system-level config)
        localStorage.removeItem('authMobile');
        localStorage.removeItem('farmerId');
        
        console.log('✅ [Auth] Logout complete');
      },

      checkAuth: () => {
        // CRITICAL: Validate existing session on app load - SYNCHRONOUS header setup
        const { session, user } = get();
        
        console.log('🔍 [Auth] Checking authentication on app load');
        
        // Try to restore from persisted storage
        const storedAuth = localStorage.getItem('auth-storage');
        if (storedAuth) {
          try {
            const parsedAuth = JSON.parse(storedAuth);
            if (parsedAuth?.state?.session && parsedAuth?.state?.user) {
              console.log('📦 [Auth] Restoring from storage:', {
                userId: parsedAuth.state.user?.id,
                tenantId: parsedAuth.state.user?.tenantId,
              });
              
              set({
                session: parsedAuth.state.session,
                user: parsedAuth.state.user,
                isAuthenticated: parsedAuth.state.isAuthenticated || false,
                isPinRequired: false
              });
              
              // CRITICAL: Set global auth data SYNCHRONOUSLY to prevent race conditions
              if (parsedAuth.state.user?.id && parsedAuth.state.user?.tenantId) {
                console.log('🔐 [Auth] Setting global auth data for restored user:', {
                  userId: parsedAuth.state.user.id,
                  tenantId: parsedAuth.state.user.tenantId,
                });
                
                // Set IMMEDIATELY - no async delays!
                setGlobalAuthData(parsedAuth.state.user.id, parsedAuth.state.user.tenantId);
                updateSupabaseHeaders(parsedAuth.state.user.id, parsedAuth.state.user.tenantId);
                console.log('✅ [Auth] Global auth data and headers set IMMEDIATELY after restoration');
              }
              
              // Validate the restored session
              const { validateSession } = get();
              validateSession();
              return;
            }
          } catch (error) {
            console.error('❌ [Auth] Error restoring auth from storage:', error);
          }
        }
        
        // Only validate if we have a session that claims to be PIN verified
        // Otherwise let the user go through normal auth flow
        if (session && session.isPinVerified) {
          console.log('🔐 [Auth] Validating existing PIN-verified session');
          const { validateSession } = get();
          validateSession();
        } else {
          console.log('⚠️ [Auth] No valid session to restore');
        }
      },

      clearError: () => set({ error: null }),
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({ 
        // Only persist if session is fully verified
        user: state.isAuthenticated ? state.user : null,
        session: state.session?.isPinVerified ? state.session : null,
        isAuthenticated: state.isAuthenticated,
        isPinRequired: false // Never persist PIN requirement
      }),
    }
  )
);