import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from '../_shared/cors.ts';
import { guardTenantAccess } from '../_shared/tenantAccessGuard.ts';

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 5 SECURITY GUARD: JWT + tenant + farmer-spoof check (one call)
    //   - Validates Bearer token via getUser()
    //   - Asserts x-tenant-id / x-farmer-id are valid UUIDs
    //   - Verifies farmer.tenant_id === x-tenant-id
    //   - Verifies jwt.sub === x-farmer-id (service-role bypass for cron)
    // ═══════════════════════════════════════════════════════════════════════════
    const guard = await guardTenantAccess(req);
    if (guard instanceof Response) return guard;

    const { tenantId, farmerId, sessionToken, supabase } = guard;


    // Parse request URL - extract only the path after '/lands-api'
    const url = new URL(req.url);
    const pathAfterFunction = url.pathname.split('/lands-api')[1] || '';
    const cleanPath = pathAfterFunction.startsWith('/') ? pathAfterFunction.slice(1) : pathAfterFunction;
    
    // Get land ID if present (e.g., /lands-api/{id})
    const landId = cleanPath && !cleanPath.includes('/') ? cleanPath : null;

    // Set session variables for RLS
    const { error: sessionError } = await supabase.rpc('set_app_session', {
      p_tenant_id: tenantId,
      p_farmer_id: farmerId,
      p_session_token: sessionToken
    });

    if (sessionError) {
      console.error('Failed to set session:', sessionError);
      // Continue without RLS session - edge functions use service role key
      // This allows the API to work even if the RPC function doesn't exist
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // ACTION: infer-context  (POST /lands-api?action=infer-context)
    // Returns AI-derived suggestions for a new land based on its centroid:
    //   • reverse-geocoded village/taluka/district/state (+ matched IDs)
    //   • elevation in meters
    //   • mode of soil_type / water_source / irrigation_type / current_crop
    //     among neighbour lands within 5km for THIS tenant
    // No new edge function — runs inside the existing lands-api function.
    // ═══════════════════════════════════════════════════════════════════════════
    if (req.method === 'POST' && url.searchParams.get('action') === 'infer-context') {
      try {
        const { centroid, language = 'en' } = await req.json();
        if (!centroid?.lat || !centroid?.lng) {
          return new Response(
            JSON.stringify({ error: 'centroid {lat,lng} is required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const GOOGLE_KEY = Deno.env.get('GOOGLE_MAPS_API_KEY') ?? '';
        const fields: Record<string, any> = {};
        const confidence: Record<string, number> = {};
        const sources: Record<string, string> = {};

        // 1) Reverse geocode (Google) — vernacular language hint included
        if (GOOGLE_KEY) {
          try {
            const geoUrl = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${centroid.lat},${centroid.lng}&language=${encodeURIComponent(language)}&key=${GOOGLE_KEY}`;
            const geoRes = await fetch(geoUrl);
            const geo = await geoRes.json();
            const result = geo?.results?.[0];
            if (result?.address_components) {
              const get = (type: string) =>
                result.address_components.find((c: any) => c.types.includes(type))?.long_name || null;
              const getShort = (type: string) =>
                result.address_components.find((c: any) => c.types.includes(type))?.short_name || null;
              fields.country = get('country') || 'India';
              fields.country_code = getShort('country') || 'IN';
              fields.state = get('administrative_area_level_1');
              fields.district = get('administrative_area_level_2');
              fields.taluka = get('administrative_area_level_3') || get('sublocality_level_1');
              fields.village = get('locality') || get('sublocality') || get('administrative_area_level_4');
              fields.location_context = {
                formatted_address: result.formatted_address,
                place_id: result.place_id,
                address_components: result.address_components,
                language,
              };
              confidence.location = 0.9;
              confidence.country = 0.99;
              confidence.state = fields.state ? 0.9 : 0;
              confidence.district = fields.district ? 0.85 : 0;
              confidence.taluka = fields.taluka ? 0.7 : 0;
              confidence.village = fields.village ? 0.6 : 0;
              sources.location = 'google_reverse_geocode';
              sources.country = 'google_reverse_geocode';
              sources.state = 'google_reverse_geocode';
              sources.district = 'google_reverse_geocode';
              sources.taluka = 'google_reverse_geocode';
              sources.village = 'google_reverse_geocode';

              // Two-pass admin-ID resolver: exact → fuzzy contains, scoped to parent.
              const resolveId = async (
                table: string, name: string,
                parentField?: string, parentId?: string,
              ): Promise<string | null> => {
                try {
                  let q = supabase.from(table).select('id').eq('is_active', true).limit(1);
                  if (parentField && parentId) q = q.eq(parentField, parentId);
                  // Pass 1: exact case-insensitive
                  const { data: exact } = await q.ilike('name', name).maybeSingle();
                  if (exact?.id) return exact.id;
                  // Pass 2: fuzzy contains
                  let q2 = supabase.from(table).select('id').eq('is_active', true).limit(1);
                  if (parentField && parentId) q2 = q2.eq(parentField, parentId);
                  const { data: fuzzy } = await q2.ilike('name', `%${name}%`).maybeSingle();
                  return fuzzy?.id || null;
                } catch { return null; }
              };

              try {
                if (fields.state) {
                  const id = await resolveId('states', fields.state);
                  if (id) fields.state_id = id;
                }
                if (fields.district) {
                  const id = await resolveId('districts', fields.district, 'state_id', fields.state_id);
                  if (id) fields.district_id = id;
                }
                if (fields.taluka) {
                  const id = await resolveId('talukas', fields.taluka, 'district_id', fields.district_id);
                  if (id) fields.taluka_id = id;
                }
                if (fields.village) {
                  const id = await resolveId('villages', fields.village, 'taluka_id', fields.taluka_id);
                  if (id) fields.village_id = id;
                }
              } catch (idErr) {
                console.warn('[infer-context] admin ID resolution skipped:', idErr);
              }
            } else {
              // No geocode result — still default the country so the form has a value.
              fields.country = 'India';
              fields.country_code = 'IN';
              confidence.country = 0.5;
              sources.country = 'default';
            }
          } catch (err) {
            console.warn('[infer-context] reverse-geocode failed:', err);
          }

          // 2) Elevation
          try {
            const elevUrl = `https://maps.googleapis.com/maps/api/elevation/json?locations=${centroid.lat},${centroid.lng}&key=${GOOGLE_KEY}`;
            const elevRes = await fetch(elevUrl);
            const elev = await elevRes.json();
            const m = elev?.results?.[0]?.elevation;
            if (typeof m === 'number') {
              fields.elevation_meters = Math.round(m);
              confidence.elevation = 0.95;
              sources.elevation = 'google_elevation';
            }
          } catch (err) {
            console.warn('[infer-context] elevation failed:', err);
          }
        } else {
          console.warn('[infer-context] GOOGLE_MAPS_API_KEY missing — skipping geocode/elevation');
        }

        // 3) Neighbour summary via Postgres helper
        try {
          const { data: nbr, error: nbrErr } = await supabase.rpc('nearest_lands_summary', {
            p_lat: centroid.lat,
            p_lng: centroid.lng,
            p_radius_m: 5000,
            p_tenant_id: tenantId,
          });
          if (nbrErr) {
            console.warn('[infer-context] nearest_lands_summary error:', nbrErr.message);
          } else if (nbr && (nbr as any).neighbor_count > 0) {
            const n = nbr as any;
            // Confidence scales with how many neighbours agree.
            const c = Math.min(0.95, 0.5 + n.neighbor_count * 0.08);
            if (n.soil_type) {
              fields.soil_type = n.soil_type;
              confidence.soil_type = c;
              sources.soil_type = `neighbours(${n.neighbor_count})`;
            }
            if (n.water_source) {
              fields.water_source = n.water_source;
              confidence.water_source = c;
              sources.water_source = `neighbours(${n.neighbor_count})`;
            }
            if (n.irrigation_type) {
              fields.irrigation_type = n.irrigation_type;
              confidence.irrigation_type = c;
              sources.irrigation_type = `neighbours(${n.neighbor_count})`;
            }
            if (n.current_crop) {
              fields.current_crop = n.current_crop;
              if (n.current_crop_id) fields.current_crop_id = n.current_crop_id;
              confidence.current_crop = c;
              sources.current_crop = `neighbours(${n.neighbor_count})`;
            }
          }
        } catch (err) {
          console.warn('[infer-context] neighbour query failed:', err);
        }

        // 4) Crops reference (return list so client can render picker without re-fetch)
        let crops: any[] = [];
        try {
          const { data } = await supabase
            .from('crops')
            .select('id, value, label, label_local, label_hi, label_mr, duration_days, season, is_popular')
            .eq('is_active', true)
            .order('is_popular', { ascending: false })
            .order('display_order', { ascending: true })
            .limit(50);
          crops = data || [];
        } catch { /* non-fatal */ }

        return new Response(
          JSON.stringify({ fields, confidence, sources, crops, success: true }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } catch (err: any) {
        console.error('[infer-context] fatal:', err);
        return new Response(
          JSON.stringify({ error: err?.message || 'infer-context failed' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Handle different HTTP methods
    switch (req.method) {
      case 'GET': {
        // Check if fetching a specific land by ID
        if (landId) {
          console.log('🔍 [LandsAPI] Fetching specific land with context:', { 
            landId, 
            tenantId, 
            farmerId,
            hasSessionToken: !!sessionToken
          });
          
          // Fetch specific land by ID with joined context data
          const { data: land, error } = await supabase
            .from('lands')
            .select('*')
            .eq('id', landId)
            .eq('tenant_id', tenantId)
            .eq('farmer_id', farmerId)
            .eq('is_active', true)
            .is('deleted_at', null)
            .single();
          
          if (error || !land) {
            console.error('❌ [LandsAPI] Land fetch error:', error);
            return new Response(
              JSON.stringify({ error: error?.message || 'Land not found' }),
              { status: error ? 400 : 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }
          
          // ✅ CRITICAL: Fetch soil_health data for this land
          const { data: soilHealth } = await supabase
            .from('soil_health')
            .select('nitrogen_kg_per_ha, phosphorus_kg_per_ha, potassium_kg_per_ha, ph_level, organic_carbon, soil_moisture_surface_percent, soil_moisture_rootzone_percent, test_date, confidence_level, source')
            .eq('land_id', landId)
            .order('test_date', { ascending: false })
            .limit(1)
            .maybeSingle();
          
          // ✅ CRITICAL: Fetch latest NDVI data for this land
          const { data: ndviRecords } = await supabase
            .from('ndvi_data')
            .select('ndvi_value, mean_ndvi, date, evi_value, ndwi_value')
            .eq('land_id', landId)
            .order('date', { ascending: false })
            .limit(3);
          
          // Build enriched land data with context
          const enrichedLand = {
            ...land,
            // ✅ SOIL DATA: Prefer soil_health table, fallback to inline fields
            soil_data: soilHealth ? {
              n: soilHealth.nitrogen_kg_per_ha ?? land.nitrogen_kg_per_ha,
              p: soilHealth.phosphorus_kg_per_ha ?? land.phosphorus_kg_per_ha,
              k: soilHealth.potassium_kg_per_ha ?? land.potassium_kg_per_ha,
              ph: soilHealth.ph_level ?? land.soil_ph,
              organic_carbon: soilHealth.organic_carbon ?? land.organic_carbon_percent,
              moisture: soilHealth.soil_moisture_surface_percent ?? soilHealth.soil_moisture_rootzone_percent,
              test_date: soilHealth.test_date ?? land.last_soil_test_date,
              confidence: soilHealth.confidence_level,
              source: soilHealth.source
            } : (land.nitrogen_kg_per_ha || land.soil_ph) ? {
              n: land.nitrogen_kg_per_ha,
              p: land.phosphorus_kg_per_ha,
              k: land.potassium_kg_per_ha,
              ph: land.soil_ph,
              organic_carbon: land.organic_carbon_percent,
              test_date: land.last_soil_test_date
            } : null,
            // ✅ NDVI DATA: From ndvi_data table or inline field
            ndvi_data: ndviRecords && ndviRecords.length > 0 ? {
              value: ndviRecords[0].ndvi_value ?? ndviRecords[0].mean_ndvi ?? land.last_ndvi_value,
              trend: ndviRecords.length > 1 
                ? (ndviRecords[0].ndvi_value || 0) - (ndviRecords[1].ndvi_value || 0) 
                : 0,
              timestamp: ndviRecords[0].date ?? land.last_ndvi_calculation,
              evi: ndviRecords[0].evi_value,
              ndwi: ndviRecords[0].ndwi_value
            } : land.last_ndvi_value ? {
              value: land.last_ndvi_value,
              timestamp: land.last_ndvi_calculation
            } : null,
            // ✅ LOCATION: Structured location data
            location: {
              state: land.state,
              district: land.district,
              taluka: land.taluka,
              village: land.village,
              latitude: land.center_lat,
              longitude: land.center_lon
            }
          };
          
          console.log('✅ [LandsAPI] Enriched land context:', {
            landId: enrichedLand.id,
            hasSoilData: !!enrichedLand.soil_data,
            hasNdviData: !!enrichedLand.ndvi_data,
            soilN: enrichedLand.soil_data?.n,
            ndviValue: enrichedLand.ndvi_data?.value
          });
          
          const data = enrichedLand;

          console.log('✅ [LandsAPI] Land fetched successfully:', {
            landId: data.id,
            landName: data.name
          });

          return new Response(
            JSON.stringify({ data, success: true }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        } else {
          // PHASE 3B: Optional incremental delta sync via ?since=ISO8601
          const sinceParam = url.searchParams.get('since');
          console.log('📋 [LandsAPI] Listing lands', { sinceParam });

          let listQuery = supabase
            .from('lands')
            .select('*')
            .eq('tenant_id', tenantId)
            .eq('farmer_id', farmerId)
            .eq('is_active', true)
            .is('deleted_at', null)
            .order('updated_at', { ascending: false });

          if (sinceParam) {
            listQuery = listQuery.gt('updated_at', sinceParam);
          }

          const { data: lands, error } = await listQuery;

          if (error) {
            console.error('Error fetching lands:', error);
            return new Response(
              JSON.stringify({ error: error.message }),
              { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }
          
          if (!lands || lands.length === 0) {
            return new Response(
              JSON.stringify({ data: [], success: true }),
              { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }
          
          // Fetch soil and NDVI data for all lands in batch
          const landIds = lands.map(l => l.id);
          
          const { data: soilRecords } = await supabase
            .from('soil_health')
            .select('land_id, nitrogen_kg_per_ha, phosphorus_kg_per_ha, potassium_kg_per_ha, ph_level, organic_carbon, soil_moisture_surface_percent, soil_moisture_rootzone_percent, test_date')
            .in('land_id', landIds)
            .order('test_date', { ascending: false });
          
          const { data: ndviRecords } = await supabase
            .from('ndvi_data')
            .select('land_id, ndvi_value, mean_ndvi, date')
            .in('land_id', landIds)
            .order('date', { ascending: false });
          
          // Group by land_id (take latest for each land)
          const soilByLand: Record<string, any> = {};
          const ndviByLand: Record<string, any[]> = {};
          
          soilRecords?.forEach(s => {
            if (!soilByLand[s.land_id]) soilByLand[s.land_id] = s;
          });
          
          ndviRecords?.forEach(n => {
            if (!ndviByLand[n.land_id]) ndviByLand[n.land_id] = [];
            if (ndviByLand[n.land_id].length < 3) ndviByLand[n.land_id].push(n);
          });
          
          // Enrich each land
          const enrichedLands = lands.map(land => {
            const soil = soilByLand[land.id];
            const ndviList = ndviByLand[land.id] || [];
            
            return {
              ...land,
              soil_data: soil ? {
                n: soil.nitrogen_kg_per_ha ?? land.nitrogen_kg_per_ha,
                p: soil.phosphorus_kg_per_ha ?? land.phosphorus_kg_per_ha,
                k: soil.potassium_kg_per_ha ?? land.potassium_kg_per_ha,
                ph: soil.ph_level ?? land.soil_ph,
                organic_carbon: soil.organic_carbon ?? land.organic_carbon_percent,
                moisture: soil.soil_moisture_surface_percent ?? soil.soil_moisture_rootzone_percent,
                test_date: soil.test_date ?? land.last_soil_test_date
              } : (land.nitrogen_kg_per_ha || land.soil_ph) ? {
                n: land.nitrogen_kg_per_ha,
                p: land.phosphorus_kg_per_ha,
                k: land.potassium_kg_per_ha,
                ph: land.soil_ph,
                organic_carbon: land.organic_carbon_percent,
                test_date: land.last_soil_test_date
              } : null,
              ndvi_data: ndviList.length > 0 ? {
                value: ndviList[0].ndvi_value ?? ndviList[0].mean_ndvi ?? land.last_ndvi_value,
                trend: ndviList.length > 1 
                  ? (ndviList[0].ndvi_value || 0) - (ndviList[1].ndvi_value || 0)
                  : 0,
                timestamp: ndviList[0].date ?? land.last_ndvi_calculation
              } : land.last_ndvi_value ? {
                value: land.last_ndvi_value,
                timestamp: land.last_ndvi_calculation
              } : null,
              location: {
                state: land.state,
                district: land.district,
                taluka: land.taluka,
                village: land.village,
                latitude: land.center_lat,
                longitude: land.center_lon
              }
            };
          });
          
          console.log(`✅ [LandsAPI] Enriched ${enrichedLands.length} lands with soil/NDVI data`);

          return new Response(
            JSON.stringify({ data: enrichedLands, success: true }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }

      case 'POST': {
        // Create new land
        const body = await req.json();
        
        console.log('📝 [LandsAPI] Creating land:', {
          name: body.name,
          area_acres: body.area_acres,
          hasBoundary: !!body.boundary_polygon_old,
          tenantId,
          farmerId
        });

        // Validate required fields
        if (!body.name || !body.name.trim()) {
          console.error('❌ [LandsAPI] Validation failed: Missing name');
          return new Response(
            JSON.stringify({ error: 'Land name is required', field: 'name' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        if (!body.area_acres || body.area_acres <= 0) {
          console.error('❌ [LandsAPI] Validation failed: Invalid area');
          return new Response(
            JSON.stringify({ error: 'Valid area is required', field: 'area_acres' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        
        // Auto-compute center_lat/center_lon from boundary polygon on create
        if (body.boundary_polygon_old && (!body.center_lat || !body.center_lon)) {
          const ring = body.boundary_polygon_old?.coordinates?.[0];
          if (ring && ring.length > 0) {
            body.center_lat = ring.reduce((s: number, c: number[]) => s + c[1], 0) / ring.length;
            body.center_lon = ring.reduce((s: number, c: number[]) => s + c[0], 0) / ring.length;
            console.log(`📍 [LandsAPI] Auto-computed centroid on create: ${body.center_lat}, ${body.center_lon}`);
          }
        }

        // Ensure tenant_id and farmer_id are set correctly (override any sent values)
        const landData = {
          ...body,
          tenant_id: tenantId,
          farmer_id: farmerId,
          is_active: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };

        // Remove any undefined values that could cause issues
        Object.keys(landData).forEach(key => {
          if (landData[key] === undefined || landData[key] === '') {
            delete landData[key];
          }
        });

        console.log('📝 [LandsAPI] Inserting land data with fields:', Object.keys(landData));

        const { data, error } = await supabase
          .from('lands')
          .insert([landData])
          .select()
          .single();

        if (error) {
          console.error('❌ [LandsAPI] Database error creating land:', {
            error: error.message,
            code: error.code,
            details: error.details,
            hint: error.hint
          });
          return new Response(
            JSON.stringify({ 
              error: error.message,
              details: error.details,
              hint: error.hint 
            }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        console.log('✅ [LandsAPI] Land created successfully:', {
          id: data.id,
          name: data.name
        });

        return new Response(
          JSON.stringify({ data, success: true }),
          { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'PUT':
      case 'PATCH': {
        // Update existing land
        if (!landId) {
          return new Response(
            JSON.stringify({ error: 'Land ID is required for update' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const body = await req.json();

        // Auto-compute center_lat/center_lon from boundary polygon if missing
        if (body.boundary_polygon_old && (!body.center_lat || !body.center_lon)) {
          const ring = body.boundary_polygon_old?.coordinates?.[0];
          if (ring && ring.length > 0) {
            body.center_lat = ring.reduce((s: number, c: number[]) => s + c[1], 0) / ring.length;
            body.center_lon = ring.reduce((s: number, c: number[]) => s + c[0], 0) / ring.length;
            console.log(`📍 [LandsAPI] Auto-computed centroid: ${body.center_lat}, ${body.center_lon}`);
          }
        }
        
        // Remove fields that shouldn't be updated
        delete body.id;
        delete body.tenant_id;
        delete body.farmer_id;
        delete body.created_at;

        // ✅ CRITICAL: Sanitize date fields - convert empty strings to null
        const dateFields = [
          'cultivation_date', 'planting_date', 'harvest_date', 
          'last_harvest_date', 'last_sowing_date', 'expected_harvest_date',
          'last_soil_test_date', 'last_ndvi_calculation', 'gps_recorded_at'
        ];
        
        dateFields.forEach(field => {
          if (body[field] === '' || body[field] === undefined) {
            body[field] = null;
          }
        });

        // Remove undefined values
        Object.keys(body).forEach(key => {
          if (body[key] === undefined) {
            delete body[key];
          }
        });

        const updateData = {
          ...body,
          updated_at: new Date().toISOString()
        };

        const { data, error } = await supabase
          .from('lands')
          .update(updateData)
          .eq('id', landId)
          .eq('tenant_id', tenantId)
          .eq('farmer_id', farmerId)
          .is('deleted_at', null)
          .select()
          .single();

        if (error) {
          console.error('Error updating land:', error);
          return new Response(
            JSON.stringify({ error: error.message }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        if (!data) {
          return new Response(
            JSON.stringify({ error: 'Land not found or access denied' }),
            { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        return new Response(
          JSON.stringify({ data, success: true }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'DELETE': {
        // Soft delete (update is_active and set deleted_at)
        if (!landId) {
          return new Response(
            JSON.stringify({ error: 'Land ID is required for deletion' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const { data, error } = await supabase
          .from('lands')
          .update({
            is_active: false,
            deleted_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq('id', landId)
          .eq('tenant_id', tenantId)
          .eq('farmer_id', farmerId)
          .is('deleted_at', null)
          .select()
          .single();

        if (error) {
          console.error('Error deleting land:', error);
          return new Response(
            JSON.stringify({ error: error.message }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        if (!data) {
          return new Response(
            JSON.stringify({ error: 'Land not found or already deleted' }),
            { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        return new Response(
          JSON.stringify({ data, success: true, message: 'Land deleted successfully' }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      default:
        return new Response(
          JSON.stringify({ error: `Method ${req.method} not allowed` }),
          { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
  } catch (error) {
    console.error('Unexpected error:', error);
    return new Response(
      JSON.stringify({ 
        error: error.message, 
        details: 'An unexpected error occurred while processing the request' 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});