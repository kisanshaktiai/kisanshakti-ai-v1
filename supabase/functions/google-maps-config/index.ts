import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { corsHeaders } from '../_shared/cors.ts'

serve(async (req) => {
  const startTime = Date.now();
  const requestId = crypto.randomUUID().slice(0, 8);
  
  console.log(`📍 [GoogleMapsConfig] [${requestId}] Request received: ${req.method}`);

  // Handle CORS preflight - must return 204 with proper headers
  if (req.method === 'OPTIONS') {
    console.log(`📍 [GoogleMapsConfig] [${requestId}] CORS preflight - OK`);
    return new Response(null, { 
      status: 204,
      headers: corsHeaders 
    });
  }

  try {
    // Get the Google Maps API key from environment
    const apiKey = Deno.env.get('GOOGLE_MAPS_API_KEY');
    
    if (!apiKey) {
      console.error(`❌ [GoogleMapsConfig] [${requestId}] API key not found in environment`);
      return new Response(
        JSON.stringify({ 
          error: 'Google Maps API key not configured',
          requestId 
        }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Validate key format (basic check)
    if (apiKey.length < 20) {
      console.error(`❌ [GoogleMapsConfig] [${requestId}] API key appears invalid (too short)`);
      return new Response(
        JSON.stringify({ 
          error: 'Invalid API key configuration',
          requestId 
        }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    const duration = Date.now() - startTime;
    console.log(`✅ [GoogleMapsConfig] [${requestId}] Success - API key retrieved (${duration}ms)`);
    
    return new Response(
      JSON.stringify({ 
        apiKey,
        requestId,
        timestamp: new Date().toISOString()
      }),
      { 
        status: 200, 
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json',
          'Cache-Control': 'private, max-age=3600'
        } 
      }
    );
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`❌ [GoogleMapsConfig] [${requestId}] Error (${duration}ms):`, error);
    
    return new Response(
      JSON.stringify({ 
        error: error.message || 'Internal server error',
        requestId 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
})
