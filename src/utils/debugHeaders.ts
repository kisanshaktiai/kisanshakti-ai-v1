import { supabase } from '@/integrations/supabase/client';
import { dataIsolation } from '@/services/dataIsolationService';

export interface HeaderTestResult {
  headersSent: Record<string, string>;
  headersReceived: Record<string, string>;
  success: boolean;
  error?: string;
}

export async function testEdgeFunctionHeaders(
  functionName: string,
  body: any = {}
): Promise<HeaderTestResult> {
  const headers = dataIsolation.getIsolationHeaders();
  
  // Convert HeadersInit to Record<string, string> for logging
  const headersRecord: Record<string, string> = {};
  if (Array.isArray(headers)) {
    headers.forEach(([key, value]) => {
      headersRecord[key] = value;
    });
  } else if (headers instanceof Headers) {
    headers.forEach((value, key) => {
      headersRecord[key] = value;
    });
  } else if (headers) {
    Object.assign(headersRecord, headers);
  }
  
  console.log(`[Debug] Calling ${functionName} with headers:`, headersRecord);
  
  try {
    const response = await supabase.functions.invoke(functionName, {
      body,
      headers: headers as Record<string, string>,
    });
    
    return {
      headersSent: headersRecord,
      headersReceived: response.data?.headers || {},
      success: !response.error,
      error: response.error?.message,
    };
  } catch (error: any) {
    console.error(`[Debug] Error calling ${functionName}:`, error);
    return {
      headersSent: headersRecord,
      headersReceived: {},
      success: false,
      error: error?.message || 'Unknown error',
    };
  }
}

// Expose globally for browser console debugging
if (typeof window !== 'undefined') {
  (window as any).__testHeaders = testEdgeFunctionHeaders;
  console.log('🔧 Header test tool loaded! Run window.__testHeaders("function-name", {body}) in console.');
}
