-- Leverage existing farmers table as sellers
ALTER TABLE farmers ADD COLUMN IF NOT EXISTS seller_profile JSONB DEFAULT '{}';
ALTER TABLE farmers ADD COLUMN IF NOT EXISTS seller_rating DECIMAL(3,2) DEFAULT 0.0;
ALTER TABLE farmers ADD COLUMN IF NOT EXISTS total_sales INTEGER DEFAULT 0;
ALTER TABLE farmers ADD COLUMN IF NOT EXISTS seller_verified BOOLEAN DEFAULT false;
ALTER TABLE farmers ADD COLUMN IF NOT EXISTS store_name TEXT;
ALTER TABLE farmers ADD COLUMN IF NOT EXISTS store_description TEXT;

-- Use existing lands table for location-based discovery
ALTER TABLE lands ADD COLUMN IF NOT EXISTS marketplace_enabled BOOLEAN DEFAULT false;

-- Enhanced products table for marketplace
CREATE TABLE IF NOT EXISTS marketplace_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id UUID REFERENCES farmers(id) ON DELETE CASCADE,
  land_id UUID REFERENCES lands(id) ON DELETE SET NULL,
  category_id UUID REFERENCES marketplace_categories(id),
  name TEXT NOT NULL,
  description TEXT,
  price DECIMAL(10,2) NOT NULL,
  discount_price DECIMAL(10,2),
  quantity_available INTEGER NOT NULL DEFAULT 0,
  unit TEXT NOT NULL,
  images JSONB DEFAULT '[]',
  specifications JSONB DEFAULT '{}',
  tags TEXT[] DEFAULT '{}',
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'out_of_stock')),
  views INTEGER DEFAULT 0,
  featured BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Shopping cart
CREATE TABLE IF NOT EXISTS cart_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  product_id UUID REFERENCES marketplace_products(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL DEFAULT 1,
  added_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, product_id)
);

-- Wishlist
CREATE TABLE IF NOT EXISTS wishlist_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  product_id UUID REFERENCES marketplace_products(id) ON DELETE CASCADE,
  added_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, product_id)
);

-- Orders table
CREATE TABLE IF NOT EXISTS marketplace_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number TEXT UNIQUE NOT NULL DEFAULT ('ORD-' || LPAD(FLOOR(RANDOM() * 1000000)::TEXT, 6, '0')),
  buyer_id UUID NOT NULL,
  seller_id UUID REFERENCES farmers(id),
  total_amount DECIMAL(10,2) NOT NULL,
  shipping_address JSONB NOT NULL,
  payment_method TEXT,
  payment_status TEXT DEFAULT 'pending' CHECK (payment_status IN ('pending', 'paid', 'failed', 'refunded')),
  order_status TEXT DEFAULT 'pending' CHECK (order_status IN ('pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled')),
  tracking_number TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Order items
CREATE TABLE IF NOT EXISTS order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES marketplace_orders(id) ON DELETE CASCADE,
  product_id UUID REFERENCES marketplace_products(id),
  quantity INTEGER NOT NULL,
  unit_price DECIMAL(10,2) NOT NULL,
  total_price DECIMAL(10,2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Reviews and ratings
CREATE TABLE IF NOT EXISTS product_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID REFERENCES marketplace_products(id) ON DELETE CASCADE,
  buyer_id UUID NOT NULL,
  order_id UUID REFERENCES marketplace_orders(id),
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment TEXT,
  images JSONB DEFAULT '[]',
  helpful_count INTEGER DEFAULT 0,
  verified_purchase BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(product_id, buyer_id, order_id)
);

-- Chat messages between buyers and sellers
CREATE TABLE IF NOT EXISTS marketplace_chats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id UUID NOT NULL,
  seller_id UUID REFERENCES farmers(id),
  product_id UUID REFERENCES marketplace_products(id),
  last_message TEXT,
  last_message_at TIMESTAMPTZ,
  buyer_unread INTEGER DEFAULT 0,
  seller_unread INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(buyer_id, seller_id, product_id)
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id UUID REFERENCES marketplace_chats(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL,
  message TEXT NOT NULL,
  attachments JSONB DEFAULT '[]',
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Search history for autocomplete
CREATE TABLE IF NOT EXISTS search_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  search_term TEXT NOT NULL,
  results_count INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Product views tracking
CREATE TABLE IF NOT EXISTS product_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID REFERENCES marketplace_products(id) ON DELETE CASCADE,
  user_id UUID,
  ip_address INET,
  viewed_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_marketplace_products_seller ON marketplace_products(seller_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_products_category ON marketplace_products(category_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_products_status ON marketplace_products(status);
CREATE INDEX IF NOT EXISTS idx_marketplace_products_search ON marketplace_products USING gin(to_tsvector('english', name || ' ' || COALESCE(description, '')));
CREATE INDEX IF NOT EXISTS idx_cart_user ON cart_items(user_id);
CREATE INDEX IF NOT EXISTS idx_wishlist_user ON wishlist_items(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_buyer ON marketplace_orders(buyer_id);
CREATE INDEX IF NOT EXISTS idx_orders_seller ON marketplace_orders(seller_id);
CREATE INDEX IF NOT EXISTS idx_reviews_product ON product_reviews(product_id);
CREATE INDEX IF NOT EXISTS idx_chats_participants ON marketplace_chats(buyer_id, seller_id);

-- Enable RLS
ALTER TABLE marketplace_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE cart_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE wishlist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketplace_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketplace_chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Products are viewable by everyone" ON marketplace_products FOR SELECT USING (true);
CREATE POLICY "Sellers can manage their products" ON marketplace_products FOR ALL USING (auth.uid() = seller_id);

CREATE POLICY "Users can manage their cart" ON cart_items FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage their wishlist" ON wishlist_items FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can view their orders" ON marketplace_orders FOR SELECT USING (auth.uid() = buyer_id OR auth.uid() = seller_id);
CREATE POLICY "Users can create orders" ON marketplace_orders FOR INSERT WITH CHECK (auth.uid() = buyer_id);

CREATE POLICY "Users can view order items" ON order_items FOR SELECT USING (EXISTS (SELECT 1 FROM marketplace_orders WHERE id = order_items.order_id AND (buyer_id = auth.uid() OR seller_id = auth.uid())));

CREATE POLICY "Reviews are viewable by everyone" ON product_reviews FOR SELECT USING (true);
CREATE POLICY "Buyers can create reviews" ON product_reviews FOR INSERT WITH CHECK (auth.uid() = buyer_id);

CREATE POLICY "Users can view their chats" ON marketplace_chats FOR SELECT USING (auth.uid() = buyer_id OR auth.uid() = seller_id);
CREATE POLICY "Users can create chats" ON marketplace_chats FOR INSERT WITH CHECK (auth.uid() = buyer_id);

CREATE POLICY "Chat participants can view messages" ON chat_messages FOR SELECT USING (EXISTS (SELECT 1 FROM marketplace_chats WHERE id = chat_messages.chat_id AND (buyer_id = auth.uid() OR seller_id = auth.uid())));
CREATE POLICY "Chat participants can send messages" ON chat_messages FOR INSERT WITH CHECK (auth.uid() = sender_id);

-- Function to update seller rating
CREATE OR REPLACE FUNCTION update_seller_rating() RETURNS TRIGGER AS $$
BEGIN
  UPDATE farmers SET 
    seller_rating = (
      SELECT AVG(rating)::DECIMAL(3,2) 
      FROM product_reviews r
      JOIN marketplace_products p ON r.product_id = p.id
      WHERE p.seller_id = (
        SELECT seller_id FROM marketplace_products WHERE id = NEW.product_id
      )
    )
  WHERE id = (SELECT seller_id FROM marketplace_products WHERE id = NEW.product_id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_seller_rating_trigger
AFTER INSERT OR UPDATE ON product_reviews
FOR EACH ROW EXECUTE FUNCTION update_seller_rating();