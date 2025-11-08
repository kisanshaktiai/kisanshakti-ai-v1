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

    // Convert boundary to GeoJSON format for JSONB storage if boundary exists
    let boundaryGeoJSON = null;
    let centerGeoJSON = null;

    if (body.boundary && Array.isArray(body.boundary) && body.boundary.length > 0) {
      console.log('Processing boundary data:', { pointCount: body.boundary.length });
      
      // Create GeoJSON Polygon
      // Ensure the polygon is closed (first point = last point)
      const points = [...body.boundary];
      if (points.length > 0) {
        const firstPoint = points[0];
        const lastPoint = points[points.length - 1];
        
        // Close the polygon if not already closed
        if (firstPoint.lat !== lastPoint.lat || firstPoint.lng !== lastPoint.lng) {
          points.push(firstPoint);
        }
        
        // GeoJSON uses [lng, lat] order (NOT [lat, lng])
        const coordinates = points.map((p: any) => [p.lng, p.lat]);
        
        boundaryGeoJSON = {
          type: 'Polygon',
          coordinates: [coordinates] // Array of rings, we only have one outer ring
        };
        
        console.log('Generated boundary GeoJSON:', JSON.stringify(boundaryGeoJSON));
        
        // Calculate center point
        const sumLat = body.boundary.reduce((sum: number, p: any) => sum + p.lat, 0);
        const sumLng = body.boundary.reduce((sum: number, p: any) => sum + p.lng, 0);
        const centerLat = sumLat / body.boundary.length;
        const centerLng = sumLng / body.boundary.length;
        
        // GeoJSON Point
        centerGeoJSON = {
          type: 'Point',
          coordinates: [centerLng, centerLat] // [lng, lat] order
        };
        
        console.log('Generated center GeoJSON:', JSON.stringify(centerGeoJSON));
      }
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

      // Boundary info (GeoJSON format for JSONB storage)
      boundary_polygon_old: boundaryGeoJSON,
      center_point_old: centerGeoJSON,
      boundary_method: boundaryGeoJSON ? 'gps_points' : null,
      gps_accuracy_meters: boundaryGeoJSON ? 10 : null,
      gps_recorded_at: boundaryGeoJSON ? new Date().toISOString() : null,

      // Status and timestamps
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    console.log('Inserting land data:', JSON.stringify(landData, null, 2));

    // Insert land record using raw SQL with PostGIS functions for geometry columns
    let query: any;
    let data: any;
    let error: any;
    
    if (boundaryGeoJSON) {
      console.log('Inserting land with geometry using RPC...');
      
      const { data: insertData, error: insertError } = await supabase.rpc('insert_land_with_geometry', {
        p_farmer_id: farmerId,
        p_tenant_id: tenantId,
        p_name: body.name,
        p_ownership_type: body.ownership_type,
        p_area_acres: body.area_acres,
        p_survey_number: body.survey_number || null,
        p_state_id: body.state_id || null,
        p_state: body.state || null,
        p_district_id: body.district_id || null,
        p_district: body.district || null,
        p_taluka_id: body.taluka_id || null,
        p_taluka: body.taluka || null,
        p_village_id: body.village_id || null,
        p_village: body.village || null,
        p_soil_type: body.soil_type || null,
        p_water_source: body.water_source || null,
        p_irrigation_type: body.irrigation_type || null,
        p_current_crop: body.current_crop || null,
        p_previous_crop: body.previous_crop || null,
        p_cultivation_date: body.cultivation_date || null,
        p_last_harvest_date: body.last_harvest_date || null,
        p_area_guntas: body.area_guntas || null,
        p_area_sqft: body.area_sqft || null,
        p_boundary_geojson: boundaryGeoJSON,
        p_center_geojson: centerGeoJSON
      });
      data = insertData;
      error = insertError;
      
      if (error) {
        console.error('RPC Error:', error);
      } else {
        console.log('Land saved successfully via RPC:', data);
      }
    } else {
      // No geometry - use regular insert
      const { data: insertData, error: insertError } = await supabase
        .from('lands')
        .insert([landData])
        .select()
        .single();
      data = insertData;
      error = insertError;
    }

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
