-- Create app_versions table for tracking app releases
CREATE TABLE IF NOT EXISTS public.app_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version VARCHAR(20) NOT NULL,
  build_hash VARCHAR(64) NOT NULL UNIQUE,
  is_current BOOLEAN DEFAULT false,
  release_notes TEXT,
  features_added JSONB DEFAULT '[]'::jsonb,
  bugs_fixed JSONB DEFAULT '[]'::jsonb,
  breaking_changes JSONB DEFAULT '[]'::jsonb,
  min_supported_version VARCHAR(20),
  force_update BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  deployed_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Only one version can be current at a time
CREATE UNIQUE INDEX idx_app_versions_current_unique ON public.app_versions(is_current) WHERE is_current = true;

-- Index for fast current version lookup
CREATE INDEX idx_app_versions_current ON public.app_versions(is_current) WHERE is_current = true;

-- Index for build hash lookups
CREATE INDEX idx_app_versions_build_hash ON public.app_versions(build_hash);

-- Enable Row Level Security
ALTER TABLE public.app_versions ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone can read app versions (needed for update checks)
CREATE POLICY "Anyone can read app versions"
  ON public.app_versions
  FOR SELECT
  USING (true);

-- Policy: Only admins can insert/update/delete versions
CREATE POLICY "Admins can manage app versions"
  ON public.app_versions
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_users
      WHERE id = auth.uid() AND is_active = true
    )
  );

-- Comment on table
COMMENT ON TABLE public.app_versions IS 'Tracks app version releases with build hashes for automatic cache invalidation';

-- Insert initial version
INSERT INTO public.app_versions (
  version,
  build_hash,
  is_current,
  release_notes,
  features_added,
  deployed_at
) VALUES (
  '2.1.0',
  'initial-version',
  true,
  'Database-driven version management system with automatic cache invalidation',
  '["Auto theme sync", "Silent updates for rural users", "Database-driven version tracking"]'::jsonb,
  now()
) ON CONFLICT (build_hash) DO NOTHING;