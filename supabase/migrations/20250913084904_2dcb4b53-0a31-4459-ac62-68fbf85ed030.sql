-- Add location ID columns to lands table
ALTER TABLE public.lands
ADD COLUMN IF NOT EXISTS state_id UUID,
ADD COLUMN IF NOT EXISTS district_id UUID,
ADD COLUMN IF NOT EXISTS taluka_id UUID,
ADD COLUMN IF NOT EXISTS village_id UUID;

-- Add foreign key constraints
ALTER TABLE public.lands
ADD CONSTRAINT fk_lands_state FOREIGN KEY (state_id) REFERENCES states(id) ON DELETE SET NULL,
ADD CONSTRAINT fk_lands_district FOREIGN KEY (district_id) REFERENCES districts(id) ON DELETE SET NULL,
ADD CONSTRAINT fk_lands_taluka FOREIGN KEY (taluka_id) REFERENCES talukas(id) ON DELETE SET NULL,
ADD CONSTRAINT fk_lands_village FOREIGN KEY (village_id) REFERENCES villages(id) ON DELETE SET NULL;

-- Add indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_lands_state_id ON public.lands(state_id);
CREATE INDEX IF NOT EXISTS idx_lands_district_id ON public.lands(district_id);
CREATE INDEX IF NOT EXISTS idx_lands_taluka_id ON public.lands(taluka_id);
CREATE INDEX IF NOT EXISTS idx_lands_village_id ON public.lands(village_id);