import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-session-token, x-tenant-id, x-farmer-id'
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Create Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Extract authentication and tenant context
    let sessionToken = req.headers.get('x-session-token');
    let tenantId = req.headers.get('x-tenant-id');
    let farmerId = req.headers.get('x-farmer-id');

    // Parse request body
    const body = await req.json();
    console.log('Received land data:', body);

    // Fallback to body values if headers are missing
    if (!tenantId && body.tenant_id) tenantId = body.tenant_id;
    if (!farmerId && body.farmer_id) farmerId = body.farmer_id;
    if (!sessionToken && body.session_token) sessionToken = body.session_token;

    console.log('Session context:', { sessionToken, tenantId, farmerId });

    // Validate context
    if (!tenantId || !farmerId) {
      return new Response(
        JSON.stringify({
          error: 'Missing authentication context',
          details: 'Tenant ID and farmer ID must be provided in headers or body'
        }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // Validate required land fields
    const requiredFields = ['name', 'ownership_type', 'area_acres'];
    for (const field of requiredFields) {
      if (body[field] === undefined || body[field] === null || body[field] === '') {
        return new Response(
          JSON.stringify({
            error: `${field} is required`,
            details: `The field "${field}" must be provided and cannot be empty`
          }),
          {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        );
      }
    }

    // Prepare boundary polygon and center point
    let boundaryPolygon = null;
    let centerPoint = null;
    if (body.boundary && body.boundary.length > 0) {
      const coordinates = body.boundary.map((point: any) => [point.lng, point.lat]);
      if (coordinates.length > 0) {
        coordinates.push(coordinates[0]); // close polygon
      }
      boundaryPolygon = {
        type: 'Polygon',
        coordinates: [coordinates]
      };
      const centerLat =
        body.boundary.reduce((sum: number, p: any) => sum + p.lat, 0) /
        body.boundary.length;
      const centerLng =
        body.boundary.reduce((sum: number, p: any) => sum + p.lng, 0) /
        body.boundary.length;
      centerPoint = {
        type: 'Point',
        coordinates: [centerLng, centerLat]
      };
    }

    // Prepare land data for insertion
    const landData = {
      farmer_id: farmerId,
      tenant_id: tenantId,

      // Required
      name: body.name,
      ownership_type: body.ownership_type,
      area_acres: body.area_acres,

      // Optional survey details
      survey_number: body.survey_number || null,

      // Optional location fields
      state_id: body.state_id || null,
      state: body.state || null,
      district_id: body.district_id || null,
      district: body.district || null,
      taluka_id: body.taluka_id || null,
      taluka: body.taluka || null,
      village_id: body.village_id || null,
      village: body.village || null,

      // Optional land characteristics
      soil_type: body.soil_type || null,
      water_source: body.water_source || null,
      irrigation_type: body.irrigation_type || null,

      // Optional crop info
      current_crop: body.current_crop || null,
      previous_crop: body.previous_crop || null,
      cultivation_date: body.cultivation_date || null,
      last_harvest_date: body.last_harvest_date || null,

      // Area info
      area_guntas: body.area_guntas || null,
      area_sqft: body.area_sqft || null,

      // Boundary info
      boundary_polygon_old: boundaryPolygon,
      center_point_old: centerPoint,
      boundary_method: boundaryPolygon ? 'gps_points' : null,
      gps_accuracy_meters: boundaryPolygon ? 10 : null,
      gps_recorded_at: boundaryPolygon ? new Date().toISOString() : null,

      // Status and timestamps
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    console.log('Inserting land data:', landData);

    // Insert land record
    const { data, error } = await supabase
      .from('lands')
      .insert([landData]) // insert expects an array
      .select()
      .single();

    if (error) {
      console.error('Error inserting land:', error);
      return new Response(
        JSON.stringify({
          error: error.message,
          details: error.details || 'Failed to save land record to database',
          code: error.code || 'DATABASE_ERROR'
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    console.log('Land saved successfully:', data);

    return new Response(
      JSON.stringify({
        success: true,
        data,
        message: 'Land saved successfully'
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  } catch (error) {
    console.error('Unexpected error:', error);
    return new Response(
      JSON.stringify({
        error: error.message,
        details: 'An unexpected error occurred while processing the request',
        code: 'INTERNAL_ERROR'
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
