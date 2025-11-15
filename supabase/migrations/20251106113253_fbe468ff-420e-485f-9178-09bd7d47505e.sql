-- Create video_tutorials table for centralized video help system
CREATE TABLE IF NOT EXISTS public.video_tutorials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  video_url TEXT NOT NULL,
  thumbnail_url TEXT,
  category TEXT NOT NULL,
  subcategory TEXT,
  language TEXT DEFAULT 'en',
  duration_minutes INTEGER,
  tags TEXT[],
  view_count INTEGER DEFAULT 0,
  is_featured BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_video_tutorials_category ON public.video_tutorials(category);
CREATE INDEX IF NOT EXISTS idx_video_tutorials_language ON public.video_tutorials(language);
CREATE INDEX IF NOT EXISTS idx_video_tutorials_tags ON public.video_tutorials USING GIN(tags);

-- Enable Row Level Security
ALTER TABLE public.video_tutorials ENABLE ROW LEVEL SECURITY;

-- Allow anyone to view active video tutorials
CREATE POLICY "Anyone can view active video tutorials"
  ON public.video_tutorials FOR SELECT
  USING (is_active = TRUE);

-- Create trigger for updated_at
CREATE TRIGGER update_video_tutorials_updated_at
  BEFORE UPDATE ON public.video_tutorials
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Insert sample video tutorials
INSERT INTO public.video_tutorials (title, description, video_url, category, language, tags, is_featured, duration_minutes) VALUES
  ('Modern Drip Irrigation Setup', 'Complete guide to setting up a drip irrigation system for efficient water usage', 'https://www.youtube.com/embed/dQw4w9WgXcQ', 'irrigation', 'en', ARRAY['modern', 'water-saving', 'beginner'], true, 15),
  ('ड्रिप सिंचाई प्रणाली', 'कुशल जल उपयोग के लिए ड्रिप सिंचाई प्रणाली स्थापित करने की संपूर्ण मार्गदर्शिका', 'https://www.youtube.com/embed/dQw4w9WgXcQ', 'irrigation', 'hi', ARRAY['modern', 'water-saving', 'beginner'], true, 15),
  ('Organic Fertilizer Application', 'Best practices for applying organic fertilizers to improve soil health', 'https://www.youtube.com/embed/dQw4w9WgXcQ', 'fertilizer', 'en', ARRAY['organic', 'eco-friendly', 'beginner'], true, 12),
  ('जैविक उर्वरक का उपयोग', 'मिट्टी के स्वास्थ्य में सुधार के लिए जैविक उर्वरकों को लागू करने की सर्वोत्तम प्रथाएं', 'https://www.youtube.com/embed/dQw4w9WgXcQ', 'fertilizer', 'hi', ARRAY['organic', 'eco-friendly', 'beginner'], true, 12),
  ('Integrated Pest Management', 'IPM strategies for sustainable farming and natural pest control', 'https://www.youtube.com/embed/dQw4w9WgXcQ', 'pesticide', 'en', ARRAY['organic', 'sustainable', 'advanced'], false, 18),
  ('Weeding Techniques', 'Effective weeding methods for different crop types', 'https://www.youtube.com/embed/dQw4w9WgXcQ', 'weeding', 'en', ARRAY['manual', 'beginner'], false, 10),
  ('Harvest Best Practices', 'Learn when and how to harvest crops for maximum yield and quality', 'https://www.youtube.com/embed/dQw4w9WgXcQ', 'harvest', 'en', ARRAY['timing', 'quality', 'beginner'], true, 14),
  ('फसल कटाई की तकनीक', 'अधिकतम उपज और गुणवत्ता के लिए फसलों की कटाई कब और कैसे करें', 'https://www.youtube.com/embed/dQw4w9WgXcQ', 'harvest', 'hi', ARRAY['timing', 'quality', 'beginner'], true, 14);