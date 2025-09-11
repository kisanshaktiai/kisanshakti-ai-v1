-- Create marketplace categories table
CREATE TABLE public.marketplace_categories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  icon TEXT,
  parent_id UUID REFERENCES public.marketplace_categories(id) ON DELETE CASCADE,
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create sellers table
CREATE TABLE public.marketplace_sellers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  business_name TEXT NOT NULL,
  description TEXT,
  logo_url TEXT,
  cover_image_url TEXT,
  phone TEXT,
  email TEXT,
  address JSONB,
  location GEOGRAPHY(POINT, 4326),
  rating DECIMAL(3,2) DEFAULT 0,
  total_reviews INTEGER DEFAULT 0,
  total_sales INTEGER DEFAULT 0,
  is_verified BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create products table
CREATE TABLE public.marketplace_products (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  seller_id UUID REFERENCES public.marketplace_sellers(id) ON DELETE CASCADE NOT NULL,
  category_id UUID REFERENCES public.marketplace_categories(id) NOT NULL,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  specifications JSONB DEFAULT '{}',
  price DECIMAL(10,2) NOT NULL,
  compare_at_price DECIMAL(10,2),
  currency TEXT DEFAULT 'INR',
  stock_quantity INTEGER DEFAULT 0,
  unit TEXT,
  images JSONB DEFAULT '[]',
  location GEOGRAPHY(POINT, 4326),
  rating DECIMAL(3,2) DEFAULT 0,
  total_reviews INTEGER DEFAULT 0,
  total_sales INTEGER DEFAULT 0,
  is_featured BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(seller_id, slug)
);

-- Create shopping cart table
CREATE TABLE public.marketplace_cart_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  product_id UUID REFERENCES public.marketplace_products(id) ON DELETE CASCADE NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, product_id)
);

-- Create wishlist table
CREATE TABLE public.marketplace_wishlist (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  product_id UUID REFERENCES public.marketplace_products(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, product_id)
);

-- Create orders table
CREATE TABLE public.marketplace_orders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_number TEXT NOT NULL UNIQUE,
  buyer_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  seller_id UUID REFERENCES public.marketplace_sellers(id) ON DELETE SET NULL NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  payment_status TEXT NOT NULL DEFAULT 'pending',
  payment_method TEXT,
  subtotal DECIMAL(10,2) NOT NULL,
  tax DECIMAL(10,2) DEFAULT 0,
  shipping_fee DECIMAL(10,2) DEFAULT 0,
  total DECIMAL(10,2) NOT NULL,
  shipping_address JSONB,
  billing_address JSONB,
  notes TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create order items table
CREATE TABLE public.marketplace_order_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID REFERENCES public.marketplace_orders(id) ON DELETE CASCADE NOT NULL,
  product_id UUID REFERENCES public.marketplace_products(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,
  product_image TEXT,
  price DECIMAL(10,2) NOT NULL,
  quantity INTEGER NOT NULL,
  total DECIMAL(10,2) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create reviews table
CREATE TABLE public.marketplace_reviews (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID REFERENCES public.marketplace_products(id) ON DELETE CASCADE NOT NULL,
  order_id UUID REFERENCES public.marketplace_orders(id) ON DELETE SET NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  title TEXT,
  comment TEXT,
  images JSONB DEFAULT '[]',
  is_verified_purchase BOOLEAN DEFAULT false,
  helpful_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(product_id, user_id, order_id)
);

-- Create chat messages table
CREATE TABLE public.marketplace_chat_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID NOT NULL,
  sender_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  receiver_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  product_id UUID REFERENCES public.marketplace_products(id) ON DELETE SET NULL,
  message TEXT NOT NULL,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create chat conversations table
CREATE TABLE public.marketplace_chat_conversations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  buyer_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  seller_id UUID REFERENCES public.marketplace_sellers(id) ON DELETE CASCADE NOT NULL,
  product_id UUID REFERENCES public.marketplace_products(id) ON DELETE SET NULL,
  last_message_at TIMESTAMP WITH TIME ZONE,
  unread_count_buyer INTEGER DEFAULT 0,
  unread_count_seller INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(buyer_id, seller_id, product_id)
);

-- Create indexes for better performance
CREATE INDEX idx_products_seller ON public.marketplace_products(seller_id);
CREATE INDEX idx_products_category ON public.marketplace_products(category_id);
CREATE INDEX idx_products_location ON public.marketplace_products USING GIST(location);
CREATE INDEX idx_products_price ON public.marketplace_products(price);
CREATE INDEX idx_products_rating ON public.marketplace_products(rating DESC);
CREATE INDEX idx_products_search ON public.marketplace_products USING GIN(to_tsvector('english', name || ' ' || COALESCE(description, '')));
CREATE INDEX idx_sellers_location ON public.marketplace_sellers USING GIST(location);
CREATE INDEX idx_orders_buyer ON public.marketplace_orders(buyer_id);
CREATE INDEX idx_orders_seller ON public.marketplace_orders(seller_id);
CREATE INDEX idx_orders_status ON public.marketplace_orders(status);
CREATE INDEX idx_reviews_product ON public.marketplace_reviews(product_id);
CREATE INDEX idx_chat_conversation ON public.marketplace_chat_messages(conversation_id);
CREATE INDEX idx_chat_messages_created ON public.marketplace_chat_messages(created_at DESC);

-- Enable RLS
ALTER TABLE public.marketplace_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketplace_sellers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketplace_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketplace_cart_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketplace_wishlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketplace_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketplace_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketplace_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketplace_chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketplace_chat_conversations ENABLE ROW LEVEL SECURITY;

-- RLS Policies for categories (public read)
CREATE POLICY "Categories are viewable by everyone" 
ON public.marketplace_categories FOR SELECT 
USING (is_active = true);

CREATE POLICY "Categories can be managed by admins" 
ON public.marketplace_categories FOR ALL 
USING (auth.uid() IN (SELECT id FROM auth.users WHERE raw_user_meta_data->>'role' = 'admin'));

-- RLS Policies for sellers
CREATE POLICY "Sellers are viewable by everyone" 
ON public.marketplace_sellers FOR SELECT 
USING (is_active = true);

CREATE POLICY "Users can create their own seller profile" 
ON public.marketplace_sellers FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own seller profile" 
ON public.marketplace_sellers FOR UPDATE 
USING (auth.uid() = user_id);

-- RLS Policies for products
CREATE POLICY "Active products are viewable by everyone" 
ON public.marketplace_products FOR SELECT 
USING (is_active = true);

CREATE POLICY "Sellers can manage their own products" 
ON public.marketplace_products FOR ALL 
USING (seller_id IN (SELECT id FROM public.marketplace_sellers WHERE user_id = auth.uid()));

-- RLS Policies for cart
CREATE POLICY "Users can view their own cart" 
ON public.marketplace_cart_items FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can manage their own cart" 
ON public.marketplace_cart_items FOR ALL 
USING (auth.uid() = user_id);

-- RLS Policies for wishlist
CREATE POLICY "Users can view their own wishlist" 
ON public.marketplace_wishlist FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can manage their own wishlist" 
ON public.marketplace_wishlist FOR ALL 
USING (auth.uid() = user_id);

-- RLS Policies for orders
CREATE POLICY "Users can view their own orders" 
ON public.marketplace_orders FOR SELECT 
USING (auth.uid() = buyer_id OR 
       auth.uid() IN (SELECT user_id FROM public.marketplace_sellers WHERE id = seller_id));

CREATE POLICY "Users can create orders" 
ON public.marketplace_orders FOR INSERT 
WITH CHECK (auth.uid() = buyer_id);

CREATE POLICY "Sellers can update their orders" 
ON public.marketplace_orders FOR UPDATE 
USING (auth.uid() IN (SELECT user_id FROM public.marketplace_sellers WHERE id = seller_id));

-- RLS Policies for order items
CREATE POLICY "Users can view order items for their orders" 
ON public.marketplace_order_items FOR SELECT 
USING (order_id IN (
  SELECT id FROM public.marketplace_orders 
  WHERE buyer_id = auth.uid() OR 
        seller_id IN (SELECT id FROM public.marketplace_sellers WHERE user_id = auth.uid())
));

-- RLS Policies for reviews
CREATE POLICY "Reviews are viewable by everyone" 
ON public.marketplace_reviews FOR SELECT 
USING (true);

CREATE POLICY "Users can create reviews for their purchases" 
ON public.marketplace_reviews FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own reviews" 
ON public.marketplace_reviews FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own reviews" 
ON public.marketplace_reviews FOR DELETE 
USING (auth.uid() = user_id);

-- RLS Policies for chat
CREATE POLICY "Users can view their own conversations" 
ON public.marketplace_chat_conversations FOR SELECT 
USING (auth.uid() = buyer_id OR 
       auth.uid() IN (SELECT user_id FROM public.marketplace_sellers WHERE id = seller_id));

CREATE POLICY "Users can create conversations" 
ON public.marketplace_chat_conversations FOR INSERT 
WITH CHECK (auth.uid() = buyer_id);

CREATE POLICY "Users can view messages in their conversations" 
ON public.marketplace_chat_messages FOR SELECT 
USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

CREATE POLICY "Users can send messages" 
ON public.marketplace_chat_messages FOR INSERT 
WITH CHECK (auth.uid() = sender_id);

-- Functions for updating ratings
CREATE OR REPLACE FUNCTION update_product_rating()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.marketplace_products
  SET 
    rating = (SELECT AVG(rating) FROM public.marketplace_reviews WHERE product_id = NEW.product_id),
    total_reviews = (SELECT COUNT(*) FROM public.marketplace_reviews WHERE product_id = NEW.product_id)
  WHERE id = NEW.product_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_product_rating_trigger
AFTER INSERT OR UPDATE OR DELETE ON public.marketplace_reviews
FOR EACH ROW EXECUTE FUNCTION update_product_rating();

-- Function for updating seller rating
CREATE OR REPLACE FUNCTION update_seller_rating()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.marketplace_sellers
  SET 
    rating = (
      SELECT AVG(r.rating) 
      FROM public.marketplace_reviews r
      JOIN public.marketplace_products p ON r.product_id = p.id
      WHERE p.seller_id = NEW.seller_id
    ),
    total_reviews = (
      SELECT COUNT(*) 
      FROM public.marketplace_reviews r
      JOIN public.marketplace_products p ON r.product_id = p.id
      WHERE p.seller_id = NEW.seller_id
    )
  WHERE id = NEW.seller_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to generate order number
CREATE OR REPLACE FUNCTION generate_order_number()
RETURNS TRIGGER AS $$
BEGIN
  NEW.order_number := 'ORD-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(nextval('order_number_seq')::TEXT, 6, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE SEQUENCE order_number_seq START 1;

CREATE TRIGGER set_order_number
BEFORE INSERT ON public.marketplace_orders
FOR EACH ROW EXECUTE FUNCTION generate_order_number();

-- Add sample categories
INSERT INTO public.marketplace_categories (name, slug, description, icon, sort_order) VALUES
('Seeds & Planting', 'seeds-planting', 'High-quality seeds and planting materials', 'Sprout', 1),
('Fertilizers & Pesticides', 'fertilizers-pesticides', 'Organic and chemical fertilizers, pesticides', 'Bug', 2),
('Farm Equipment', 'farm-equipment', 'Tools and machinery for farming', 'Wrench', 3),
('Irrigation', 'irrigation', 'Irrigation systems and equipment', 'Droplets', 4),
('Harvest & Storage', 'harvest-storage', 'Post-harvest and storage solutions', 'Package', 5),
('Livestock', 'livestock', 'Livestock and animal husbandry products', 'Heart', 6),
('Organic Products', 'organic-products', 'Certified organic farming products', 'Leaf', 7),
('Farm Produce', 'farm-produce', 'Fresh fruits, vegetables, and grains', 'Apple', 8);