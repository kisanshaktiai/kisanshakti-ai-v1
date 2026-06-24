import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-razorpay-signature, x-phonepe-signature',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const razorpayWebhookSecret = Deno.env.get('RAZORPAY_WEBHOOK_SECRET');
    const phonepeSaltKey = Deno.env.get('PHONEPE_SALT_KEY');

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.text();
    const payload = JSON.parse(body);

    // Determine payment provider from headers or payload
    const razorpaySignature = req.headers.get('x-razorpay-signature');
    const phonepeSignature = req.headers.get('x-phonepe-signature');

    let provider: 'razorpay' | 'phonepe';
    let isValid = false;
    let eventType: string;
    let orderId: string;
    let farmerId: string;
    let tenantId: string;
    let planId: string;
    let amount: number;
    let transactionId: string;

    if (razorpaySignature) {
      // Razorpay webhook verification
      provider = 'razorpay';
      if (!razorpayWebhookSecret) {
        return new Response(
          JSON.stringify({ error: 'RAZORPAY_WEBHOOK_SECRET not configured' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Verify HMAC-SHA256 signature
      const key = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(razorpayWebhookSecret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
      );
      const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
      const expectedSignature = Array.from(new Uint8Array(signature))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');

      isValid = expectedSignature === razorpaySignature;

      if (!isValid) {
        console.error('❌ Razorpay signature verification failed');
        return new Response(
          JSON.stringify({ error: 'Invalid signature' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Extract Razorpay event data
      eventType = payload.event;
      const paymentEntity = payload.payload?.payment?.entity;
      orderId = paymentEntity?.order_id || payload.payload?.order?.entity?.id;
      farmerId = paymentEntity?.notes?.farmer_id;
      tenantId = paymentEntity?.notes?.tenant_id;
      planId = paymentEntity?.notes?.plan_id;
      amount = (paymentEntity?.amount || 0) / 100; // Razorpay sends in paise
      transactionId = paymentEntity?.id;
    } else if (phonepeSignature) {
      // PhonePe webhook verification
      provider = 'phonepe';
      if (!phonepeSaltKey) {
        return new Response(
          JSON.stringify({ error: 'PHONEPE_SALT_KEY not configured' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // PhonePe checksum verification
      const checkData = payload.response + '/pg/v1/status' + phonepeSaltKey;
      const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(checkData));
      const expectedChecksum = Array.from(new Uint8Array(hashBuffer))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('') + '###1';

      isValid = expectedChecksum === phonepeSignature;

      if (!isValid) {
        console.error('❌ PhonePe checksum verification failed');
        return new Response(
          JSON.stringify({ error: 'Invalid checksum' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Decode PhonePe base64 response
      const decodedResponse = JSON.parse(atob(payload.response));
      eventType = decodedResponse.code === 'PAYMENT_SUCCESS' ? 'payment.captured' : 'payment.failed';
      orderId = decodedResponse.data?.merchantTransactionId;
      farmerId = decodedResponse.data?.merchantUserId?.split('_')[0]; // Convention: farmerId_timestamp
      tenantId = decodedResponse.data?.merchantUserId?.split('_')[1];
      planId = decodedResponse.data?.merchantUserId?.split('_')[2];
      amount = (decodedResponse.data?.amount || 0) / 100;
      transactionId = decodedResponse.data?.transactionId;
    } else {
      return new Response(
        JSON.stringify({ error: 'Unknown payment provider - missing signature header' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`📦 [Payment Webhook] Provider: ${provider}, Event: ${eventType}, Order: ${orderId}`);

    // Validate required fields
    if (!farmerId || !tenantId || !orderId) {
      console.error('❌ Missing required fields:', { farmerId, tenantId, orderId });
      return new Response(
        JSON.stringify({ error: 'Missing farmer_id, tenant_id, or order_id in payment data' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Idempotency check: skip if already processed
    const { data: existingSub } = await supabase
      .from('farmer_subscriptions')
      .select('id, payment_order_id')
      .eq('payment_order_id', orderId)
      .eq('payment_provider', provider)
      .maybeSingle();

    if (existingSub) {
      console.log('⚡ [Payment Webhook] Already processed order:', orderId);
      return new Response(
        JSON.stringify({ status: 'already_processed', subscription_id: existingSub.id }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (eventType === 'payment.captured' || eventType === 'payment_success') {
      // Successful payment — activate subscription
      const { data: plan } = await supabase
        .from('subscription_plans')
        .select('id, name, billing_interval')
        .eq('id', planId)
        .single();

      const intervalDays = plan?.billing_interval === 'yearly' ? 365 : 30;

      // Update existing subscription or create new
      const { data: updatedSub, error: updateError } = await supabase
        .from('farmer_subscriptions')
        .update({
          status: 'active',
          plan_id: planId,
          start_date: new Date().toISOString(),
          end_date: new Date(Date.now() + intervalDays * 24 * 60 * 60 * 1000).toISOString(),
          payment_provider: provider,
          payment_order_id: orderId,
          last_payment_date: new Date().toISOString(),
          last_payment_amount: amount,
          grace_period_ends_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq('farmer_id', farmerId)
        .eq('tenant_id', tenantId)
        .select()
        .single();

      if (updateError) {
        console.error('❌ Failed to update subscription:', updateError);
        return new Response(
          JSON.stringify({ error: 'Failed to activate subscription' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Record payment
      await supabase.from('payment_records').insert({
        tenant_id: tenantId,
        amount: amount,
        currency: 'INR',
        payment_method: provider,
        transaction_id: transactionId,
        status: 'completed',
        gateway_response: payload,
        processed_at: new Date().toISOString(),
      });

      // Create alert notification for farmer
      await supabase.from('alert_notifications').insert({
        farmer_id: farmerId,
        tenant_id: tenantId,
        alert_type: 'subscription',
        title: `✅ ${plan?.name || 'Plan'} Activated`,
        message: `Your subscription has been activated successfully. Valid for ${intervalDays} days.`,
        priority: 'medium',
        data: { plan_name: plan?.name, amount, provider, order_id: orderId },
      });

      console.log('✅ [Payment Webhook] Subscription activated:', updatedSub?.id);

      return new Response(
        JSON.stringify({ status: 'activated', subscription_id: updatedSub?.id }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } else if (eventType === 'payment.failed' || eventType === 'refund.created') {
      // Failed payment or refund — trigger grace period
      const gracePeriodEnd = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

      await supabase
        .from('farmer_subscriptions')
        .update({
          status: 'expired',
          grace_period_ends_at: gracePeriodEnd,
          updated_at: new Date().toISOString(),
        })
        .eq('farmer_id', farmerId)
        .eq('tenant_id', tenantId);

      // Notify farmer
      await supabase.from('alert_notifications').insert({
        farmer_id: farmerId,
        tenant_id: tenantId,
        alert_type: 'subscription',
        title: '⚠️ Payment Issue',
        message: 'Your payment could not be processed. You have 7 days of grace period access.',
        priority: 'high',
        data: { event: eventType, grace_period_ends_at: gracePeriodEnd },
      });

      console.log('⚠️ [Payment Webhook] Grace period triggered for farmer:', farmerId);

      return new Response(
        JSON.stringify({ status: 'grace_period_triggered' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Unknown event — acknowledge but don't process
    return new Response(
      JSON.stringify({ status: 'ignored', event: eventType }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('❌ [Payment Webhook] Error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
