ALTER TABLE public.post_translations ADD COLUMN IF NOT EXISTS tenant_id UUID;
CREATE UNIQUE INDEX IF NOT EXISTS uq_post_translations ON public.post_translations(post_id, language_code);