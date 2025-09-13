import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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

    // Get request body
    const body = await req.json();
    console.log('Received land data:', body);

    // Validate required fields
    const requiredFields = ['name', 'farmer_id', 'tenant_id', 'ownership_type', 'area_acres'];
    for (const field of requiredFields) {
      if (!body[field]) {
        return new Response(
          JSON.stringify({ error: `${field} is required` }),
          { 
            status: 400, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        );
      }
    }

    // Prepare boundary polygon in GeoJSON format
    let boundaryPolygon = null;
    let centerPoint = null;
    
    if (body.boundary && body.boundary.length > 0) {
      const coordinates = body.boundary.map((point: any) => [point.lng, point.lat]);
      // Close the polygon by adding the first point at the end
      if (coordinates.length > 0) {
        coordinates.push(coordinates[0]);
      }
      
      boundaryPolygon = {
        type: 'Polygon',
        coordinates: [coordinates]
      };

      // Calculate center point
      const centerLat = body.boundary.reduce((sum: number, p: any) => sum + p.lat, 0) / body.boundary.length;
      const centerLng = body.boundary.reduce((sum: number, p: any) => sum + p.lng, 0) / body.boundary.length;
      
      centerPoint = {
        type: 'Point',
        coordinates: [centerLng, centerLat]
      };
    }

    // Prepare land data for insertion
    const landData = {
      farmer_id: body.farmer_id,
      tenant_id: body.tenant_id,
      name: body.name,
      survey_number: body.survey_number || null,
      ownership_type: body.ownership_type,
      
      // Location fields
      state_id: body.state_id || null,
      state: body.state || null,
      district_id: body.district_id || null,
      district: body.district || null,
      taluka_id: body.taluka_id || null,
      taluka: body.taluka || null,
      village_id: body.village_id || null,
      village: body.village || null,
      
      // Land characteristics
      soil_type: body.soil_type || null,
      water_source: body.water_source || null,
      irrigation_type: body.irrigation_type || null,
      
      // Crop information
      current_crop: body.current_crop || null,
      previous_crop: body.previous_crop || null,
      cultivation_date: body.cultivation_date || null,
      last_harvest_date: body.last_harvest_date || null,
      
      // Area information
      area_acres: body.area_acres,
      area_guntas: body.area_guntas || null,
      
      // Boundary information
      boundary_polygon_old: boundaryPolygon,
      center_point_old: centerPoint,
      boundary_method: 'gps_points', // Changed from 'google_maps' to valid value
      gps_accuracy_meters: 10,
      gps_recorded_at: new Date().toISOString(),
      
      // Status
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    console.log('Inserting land data:', landData);

    // Insert land record
    const { data, error } = await supabase
      .from('lands')
      .insert(landData)
      .select()
      .single();

    if (error) {
      console.error('Error inserting land:', error);
      return new Response(
        JSON.stringify({ error: error.message }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    console.log('Land saved successfully:', data);

    // Return success response
    return new Response(
      JSON.stringify({ 
        success: true, 
        data: data,
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
      JSON.stringify({ error: error.message }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});