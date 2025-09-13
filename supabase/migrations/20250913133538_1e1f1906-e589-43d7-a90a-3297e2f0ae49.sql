-- Add deleted_at column for soft delete functionality
ALTER TABLE public.lands 
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;

-- Update the view/query to filter out soft-deleted records by default
-- This is typically done in application queries using is_active = true AND deleted_at IS NULL