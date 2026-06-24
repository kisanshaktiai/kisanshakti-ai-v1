import { useAuthStore } from '@/stores/authStore';
import { localDB } from '@/services/localDB';
import { testEdgeFunctionHeaders } from './debugHeaders';
import { dataIsolation } from '@/services/dataIsolationService';

/**
 * Debug utility to inspect authentication state and database access
 * Usage: Run `window.__debugAuth()` in browser console
 */
export async function debugAuthState() {
  console.group('🔍 AUTH DEBUG REPORT');
  
  // 1. Check auth store state
  const { user, session } = useAuthStore.getState();
  console.log('📋 User:', user);
  console.log('📋 Session:', session);
  
  // 2. Check global auth data (from client.ts)
  let globalAuthData: any = null;
  try {
    const clientModule = await import('@/integrations/supabase/client');
    // Access the private globalAuthData via the export trick
    globalAuthData = (clientModule as any).globalAuthData;
    console.log('🌐 Global Auth Data:', globalAuthData);
  } catch (error) {
    console.error('❌ Could not access global auth data:', error);
  }
  
  // 3. Test database access if user is logged in
  if (user?.id && user?.tenantId) {
    console.log('\n📡 Testing Database Access...');
    
    const { supabaseWithAuth } = await import('@/integrations/supabase/client');
    const client = supabaseWithAuth(user.id, user.tenantId);
    
    // Test farmers table
    try {
      const farmersResult = await client.from('farmers').select('*', { count: 'exact' }).eq('id', user.id);
      if (farmersResult.error) {
        console.error(`❌ Farmers:`, farmersResult.error.message);
      } else {
        console.log(`✅ Farmers: ${farmersResult.count || farmersResult.data?.length || 0} rows accessible`);
      }
    } catch (error: any) {
      console.error(`❌ Farmers query failed:`, error?.message || error);
    }
    
    // Test lands table
    try {
      const landsResult = await client.from('lands').select('*', { count: 'exact' }).eq('farmer_id', user.id);
      if (landsResult.error) {
        console.error(`❌ Lands:`, landsResult.error.message);
      } else {
        console.log(`✅ Lands: ${landsResult.count || landsResult.data?.length || 0} rows accessible`);
      }
    } catch (error: any) {
      console.error(`❌ Lands query failed:`, error?.message || error);
    }
    
    // Test crop_schedules table
    try {
      const schedulesResult = await client.from('crop_schedules').select('*', { count: 'exact' });
      if (schedulesResult.error) {
        console.error(`❌ Schedules:`, schedulesResult.error.message);
      } else {
        console.log(`✅ Schedules: ${schedulesResult.count || schedulesResult.data?.length || 0} rows accessible`);
      }
    } catch (error: any) {
      console.error(`❌ Schedules query failed:`, error?.message || error);
    }
  } else {
    console.log('\n⚠️ No user logged in - skipping database tests');
  }
  
  // 4. Check localDB status
  console.log('\n💾 LocalDB Status:');
  try {
    const farmers = await localDB.getFarmers();
    const lands = await localDB.getLands();
    const schedules = await localDB.getAllSchedules();
    const metadata = await localDB.getSyncMetadata();
    
    console.log(`  Farmers: ${farmers.length}`);
    console.log(`  Lands: ${lands.length}`);
    console.log(`  Schedules: ${schedules.length}`);
    console.log(`  Last Sync:`, metadata?.lastSyncTime ? new Date(metadata.lastSyncTime).toLocaleString() : 'Never');
  } catch (error) {
    console.error('❌ LocalDB error:', error);
  }
  
  // 5. Check localStorage
  console.log('\n🗄️ LocalStorage Keys:');
  const authKeys = ['auth-storage', 'authMobile', 'farmerId', 'tenantId'];
  authKeys.forEach(key => {
    const value = localStorage.getItem(key);
    if (value) {
      try {
        const parsed = JSON.parse(value);
        console.log(`  ${key}:`, parsed);
      } catch {
        console.log(`  ${key}:`, value);
      }
    } else {
      console.log(`  ${key}: (not set)`);
    }
  });
  
  // 6. Check isolation headers
  console.log('\n🔒 Data Isolation Headers:');
  const isolationHeaders = dataIsolation.getIsolationHeaders();
  const headersRecord: Record<string, string> = {};
  if (Array.isArray(isolationHeaders)) {
    isolationHeaders.forEach(([key, value]) => {
      headersRecord[key] = value;
    });
  } else if (isolationHeaders instanceof Headers) {
    isolationHeaders.forEach((value, key) => {
      headersRecord[key] = value;
    });
  } else if (isolationHeaders) {
    Object.assign(headersRecord, isolationHeaders);
  }
  Object.entries(headersRecord).forEach(([key, value]) => {
    console.log(`  ${key}:`, value);
  });
  
  console.log('\n📋 Available Commands:');
  console.log('  window.__testHeaders(functionName, body) - Test edge function headers');
  console.log('  Example: window.__testHeaders("weather", { location: "Mumbai" })');
  
  console.groupEnd();
  
  return {
    user,
    session,
    globalAuthData,
    localDB: {
      farmers: (await localDB.getFarmers()).length,
      lands: (await localDB.getLands()).length,
      schedules: (await localDB.getAllSchedules()).length,
    },
    isolationHeaders: headersRecord,
    testHeaders: testEdgeFunctionHeaders,
  };
}

// Expose globally for browser console debugging
if (typeof window !== 'undefined') {
  (window as any).__debugAuth = debugAuthState;
  console.log('🔧 Debug tool loaded! Run window.__debugAuth() in console to inspect auth state.');
}
