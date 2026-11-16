CREATE EXTENSION IF NOT EXISTS postgis;
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role BYPASSRLS;
CREATE TABLE public.lands(id uuid PRIMARY KEY,tenant_id uuid,farmer_id uuid,name text,boundary_geom geometry);
CREATE TABLE public.soil_health(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),land_id uuid REFERENCES lands(id),tenant_id uuid,farmer_id uuid,
 source text, test_date date, created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now(),
 ph_level numeric,organic_carbon numeric,bulk_density numeric,cec numeric,clay_percent numeric,sand_percent numeric,silt_percent numeric,
 nitrogen_kg_per_ha numeric,phosphorus_kg_per_ha numeric,potassium_kg_per_ha numeric,
 nitrogen_total_kg numeric,phosphorus_total_kg numeric,potassium_total_kg numeric,
 nitrogen_est numeric,phosphorus_est numeric,potassium_est numeric,
 nitrogen_level text,phosphorus_level text,potassium_level text,fertility_class text,confidence_level text,
 nitrogen_text text,phosphorus_text text,potassium_text text,ph_text text,organic_carbon_text text,
 nitrogen_confidence text,phosphorus_confidence text,potassium_confidence text,
 sample_count integer,field_area_ha numeric,data_quality_flags jsonb,note text
);
GRANT ALL ON public.lands,public.soil_health TO service_role;
