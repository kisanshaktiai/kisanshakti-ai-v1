CREATE TABLE IF NOT EXISTS public.post_translations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL,
  language_code TEXT NOT NULL,
  content TEXT NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.post_translations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "translations read" ON public.post_translations FOR SELECT USING (true);