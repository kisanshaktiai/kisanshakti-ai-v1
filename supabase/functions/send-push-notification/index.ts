import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { 
      farmerIds, // Array of farmer IDs to send to, or null for all
      title, 
      message, 
      alertType, // 'weather', 'pest', 'critical_recommendation', 'task_reminder'
      priority = 'medium',
      data,
      landId,
      chatMessageId
    } = await req.json();

    if (!title || !message || !alertType) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: title, message, alertType' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get VAPID keys from environment
    const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY');
    const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY');

    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
      console.error('VAPID keys not configured');
      return new Response(
        JSON.stringify({ error: 'Push notification service not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get active push subscriptions
    let subscriptionsQuery = supabase
      .from('push_subscriptions')
      .select('*')
      .eq('is_active', true);

    if (farmerIds && farmerIds.length > 0) {
      subscriptionsQuery = subscriptionsQuery.in('farmer_id', farmerIds);
    }

    const { data: subscriptions, error: subError } = await subscriptionsQuery;

    if (subError) {
      console.error('Error fetching subscriptions:', subError);
      throw subError;
    }

    if (!subscriptions || subscriptions.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'No active subscriptions found',
          sentCount: 0 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Sending ${subscriptions.length} push notifications`);

    // Send push notifications
    const results = await Promise.allSettled(
      subscriptions.map(async (sub) => {
        try {
          const pushSubscription = {
            endpoint: sub.endpoint,
            keys: {
              p256dh: sub.p256dh_key,
              auth: sub.auth_key
            }
          };

          const payload = JSON.stringify({
            title,
            body: message,
            icon: '/icon-192x192.png',
            badge: '/icon-192x192.png',
            tag: alertType,
            requireInteraction: priority === 'critical' || priority === 'high',
            data: {
              ...data,
              url: landId ? `/app/land/${landId}` : '/app/schedule',
              alertType,
              landId,
              chatMessageId
            }
          });

          // Use web-push library for sending
          const response = await sendWebPush(
            pushSubscription,
            payload,
            {
              vapidPublicKey: VAPID_PUBLIC_KEY,
              vapidPrivateKey: VAPID_PRIVATE_KEY,
              subject: 'mailto:support@kisanshakti.com'
            }
          );

          // Log notification in database
          await supabase.from('alert_notifications').insert({
            tenant_id: sub.tenant_id,
            farmer_id: sub.farmer_id,
            alert_type: alertType,
            title,
            message,
            priority,
            data,
            land_id: landId,
            chat_message_id: chatMessageId
          });

          return { success: true, farmerId: sub.farmer_id };
        } catch (error) {
          console.error(`Failed to send to ${sub.farmer_id}:`, error);
          
          // Mark subscription as inactive if endpoint is gone
          if (error.statusCode === 410) {
            await supabase
              .from('push_subscriptions')
              .update({ is_active: false })
              .eq('id', sub.id);
          }
          
          return { success: false, farmerId: sub.farmer_id, error: error.message };
        }
      })
    );

    const successCount = results.filter(r => r.status === 'fulfilled' && r.value.success).length;

    return new Response(
      JSON.stringify({ 
        success: true, 
        sentCount: successCount,
        totalSubscriptions: subscriptions.length,
        results: results.map(r => r.status === 'fulfilled' ? r.value : { success: false })
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error sending push notifications:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});

// Helper function to send web push using fetch
async function sendWebPush(
  subscription: any,
  payload: string,
  options: { vapidPublicKey: string; vapidPrivateKey: string; subject: string }
) {
  const { endpoint, keys } = subscription;
  
  // Create VAPID headers
  const vapidHeaders = createVAPIDHeaders(
    endpoint,
    options.subject,
    options.vapidPublicKey,
    options.vapidPrivateKey
  );

  // Encrypt payload
  const encryptedPayload = await encryptPayload(payload, keys.p256dh, keys.auth);

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      ...vapidHeaders,
      'Content-Type': 'application/octet-stream',
      'Content-Encoding': 'aes128gcm',
      'Content-Length': encryptedPayload.length.toString()
    },
    body: encryptedPayload
  });

  if (!response.ok) {
    throw new Error(`Push failed: ${response.status} ${response.statusText}`);
  }

  return response;
}

// Simplified VAPID header creation (you would use a proper library in production)
function createVAPIDHeaders(endpoint: string, subject: string, publicKey: string, privateKey: string) {
  // In production, use proper VAPID signing library
  // For now, return basic headers
  return {
    'Authorization': `vapid t=${generateVAPIDToken(endpoint, subject, publicKey, privateKey)}, k=${publicKey}`
  };
}

function generateVAPIDToken(endpoint: string, subject: string, publicKey: string, privateKey: string) {
  // Simplified token generation
  // In production, use proper JWT signing with ES256
  const now = Math.floor(Date.now() / 1000);
  const header = btoa(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const payload = btoa(JSON.stringify({
    aud: new URL(endpoint).origin,
    exp: now + 12 * 60 * 60,
    sub: subject
  }));
  
  return `${header}.${payload}.signature`;
}

async function encryptPayload(payload: string, p256dh: string, auth: string) {
  // Simplified encryption - in production use proper Web Push encryption
  const encoder = new TextEncoder();
  return encoder.encode(payload);
}
