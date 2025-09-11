-- Create marketplace categories first
CREATE TABLE IF NOT EXISTS marketplace_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  icon TEXT,
  description TEXT,
  parent_id UUID REFERENCES marketplace_categories(id) ON DELETE CASCADE,
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default categories
INSERT INTO marketplace_categories (name, slug, icon, description) VALUES
  ('Seeds & Planting', 'seeds', '🌱', 'Quality seeds and planting materials'),
  ('Fertilizers', 'fertilizers', '🧪', 'Organic and chemical fertilizers'),
  ('Pesticides', 'pesticides', '💊', 'Crop protection products'),
  ('Farm Equipment', 'equipment', '🚜', 'Tools and machinery'),
  ('Irrigation', 'irrigation', '💧', 'Irrigation systems and supplies'),
  ('Organic Products', 'organic', '🌿', 'Certified organic farming inputs'),
  ('Livestock', 'livestock', '🐄', 'Animals and animal products'),
  ('Fresh Produce', 'produce', '🥬', 'Fresh fruits and vegetables')
ON CONFLICT (slug) DO NOTHING;