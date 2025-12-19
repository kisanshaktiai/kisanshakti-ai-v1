import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { supabase } from '@/integrations/supabase/client';
import { MarketplaceHeader } from '@/components/marketplace/MarketplaceHeader';
import { CategoryFilter } from '@/components/marketplace/CategoryFilter';
import { ProductGrid } from '@/components/marketplace/ProductGrid';
import { ProductDetails } from '@/components/marketplace/ProductDetails';
import { ShoppingCart } from '@/components/marketplace/ShoppingCart';
import { SellerDashboard } from '@/components/marketplace/SellerDashboard';
import { OrderManagement } from '@/components/marketplace/OrderManagement';
import { MarketPriceIntelligence } from '@/components/market-intelligence';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  TrendingUp, 
  ShoppingBag, 
  Package, 
  Store,
  Leaf,
  AlertCircle
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuthStore } from '@/stores/authStore';
import { MarketSkeleton } from '@/components/skeletons';
import { cn } from '@/lib/utils';

export default function Market() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { user } = useAuthStore();
  const [activeTab, setActiveTab] = useState('prices');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<string | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [products, setProducts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [cartItems, setCartItems] = useState<any[]>([]);
  const [wishlistItems, setWishlistItems] = useState<any[]>([]);

  useEffect(() => {
    fetchCategories();
    fetchProducts();
    if (user) {
      fetchCartItems();
      fetchWishlist();
    }
  }, [user]);

  const fetchCategories = async () => {
    const { data, error } = await supabase
      .from('marketplace_categories')
      .select('*')
      .eq('is_active', true)
      .order('sort_order');

    if (!error) {
      setCategories(data || []);
    }
  };

  const fetchProducts = async () => {
    setLoading(true);
    let query = supabase
      .from('marketplace_products')
      .select(`
        *,
        seller:farmers!marketplace_products_seller_id_fkey(
          id, name, store_name, seller_rating, seller_verified
        ),
        category:marketplace_categories(name, icon)
      `)
      .eq('status', 'active');

    if (selectedCategory) {
      query = query.eq('category_id', selectedCategory);
    }

    if (searchQuery) {
      query = query.ilike('name', `%${searchQuery}%`);
    }

    const { data, error } = await query.order('featured', { ascending: false });

    if (!error) {
      setProducts(data || []);
    }
    setLoading(false);
  };

  const fetchCartItems = async () => {
    if (!user) return;
    
    const { data } = await supabase
      .from('cart_items')
      .select(`
        *,
        product:marketplace_products(
          *, 
          seller:farmers!marketplace_products_seller_id_fkey(name, store_name)
        )
      `)
      .eq('farmer_id', user.id) as any;

    if (data) {
      setCartItems(data);
    }
  };

  const fetchWishlist = async () => {
    if (!user) return;
    
    try {
      // Use any to bypass deep type instantiation issue with large Supabase schema
      const client: any = supabase;
      const { data, error } = await client
        .from('wishlist_items')
        .select('product_id')
        .eq('farmer_id', user.id);

      if (!error && data) {
        setWishlistItems(data.map((item: any) => item.product_id));
      }
    } catch (err) {
      console.error('Error fetching wishlist:', err);
    }
  };

  const addToCart = async (productId: string, quantity: number = 1) => {
    if (!user) {
      toast({
        title: t('market.auth.login_required.title'),
        description: t('market.auth.login_required.cart'),
        variant: "destructive"
      });
      return;
    }

    const { error } = await supabase
      .from('cart_items')
      .upsert({
        farmer_id: user.id,
        product_id: productId,
        quantity,
        tenant_id: user.tenantId || '',
        cart_id: user.id,
        unit_price: 0
      });

    if (!error) {
      toast({
        title: t('market.cart.added.title'),
        description: t('market.cart.added.message')
      });
      fetchCartItems();
    }
  };

  const toggleWishlist = async (productId: string) => {
    if (!user) {
      toast({
        title: t('market.auth.login_required.title'),
        description: t('market.auth.login_required.wishlist'),
        variant: "destructive"
      });
      return;
    }

    if (wishlistItems.includes(productId)) {
      await supabase
        .from('wishlist_items')
        .delete()
        .eq('user_id', user.id)
        .eq('product_id', productId);
      
      setWishlistItems(wishlistItems.filter(id => id !== productId));
    } else {
      await supabase
        .from('wishlist_items')
        .insert({
          user_id: user.id,
          product_id: productId
        });
      
      setWishlistItems([...wishlistItems, productId]);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, [selectedCategory, searchQuery]);

  if (loading && products.length === 0 && activeTab !== 'prices') {
    return <MarketSkeleton />;
  }

  // Tab configuration for mobile-first design
  const tabs = [
    { id: 'prices', icon: TrendingUp, label: 'भाव', labelEn: 'Prices' },
    { id: 'browse', icon: ShoppingBag, label: 'खरेदी', labelEn: 'Shop' },
    { id: 'orders', icon: Package, label: 'ऑर्डर', labelEn: 'Orders' },
    { id: 'sell', icon: Store, label: 'विक्री', labelEn: 'Sell' },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20">
      {/* Compact Header for non-prices tabs */}
      {activeTab !== 'prices' && (
        <MarketplaceHeader 
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onCartClick={() => setCartOpen(true)}
          cartItemCount={cartItems.length}
        />
      )}

      <div className={cn(
        "container mx-auto px-3 md:px-4",
        activeTab === 'prices' ? 'py-3' : 'py-4'
      )}>
        {/* Mobile-First Tab Navigation */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className={cn(
            "grid grid-cols-4 w-full h-14 rounded-2xl p-1.5 mb-4",
            "bg-card/80 backdrop-blur-xl border border-border/50",
            "shadow-sm"
          )}>
            {tabs.map((tab) => (
              <TabsTrigger 
                key={tab.id}
                value={tab.id} 
                className={cn(
                  "flex flex-col items-center justify-center gap-0.5 rounded-xl",
                  "text-xs font-medium transition-all duration-200",
                  "data-[state=active]:bg-primary data-[state=active]:text-primary-foreground",
                  "data-[state=active]:shadow-md"
                )}
              >
                <tab.icon className="w-4 h-4" />
                <span className="text-[10px] md:text-xs">{tab.label}</span>
              </TabsTrigger>
            ))}
          </TabsList>

          {/* Prices Tab - Main Content */}
          <TabsContent value="prices" className="mt-0">
            <MarketPriceIntelligence />
          </TabsContent>

          {/* Browse/Shop Tab */}
          <TabsContent value="browse" className="mt-0 space-y-4">
            {products.length > 0 ? (
              <>
                <CategoryFilter
                  categories={categories}
                  selectedCategory={selectedCategory}
                  onCategorySelect={setSelectedCategory}
                />
                
                <ProductGrid
                  products={products}
                  loading={loading}
                  wishlistItems={wishlistItems}
                  onProductClick={setSelectedProduct}
                  onAddToCart={addToCart}
                  onToggleWishlist={toggleWishlist}
                />
              </>
            ) : (
              <EmptyStateCard
                icon={ShoppingBag}
                title="बाजारपेठ लवकरच"
                titleEn="Marketplace Coming Soon"
                description="शेतकऱ्यांसाठी उत्पादने लवकरच उपलब्ध होतील"
                descriptionEn="Products for farmers will be available soon"
              />
            )}
          </TabsContent>

          {/* Orders Tab */}
          <TabsContent value="orders" className="mt-0">
            {user ? (
              <OrderManagement userId={user.id} />
            ) : (
              <EmptyStateCard
                icon={Package}
                title="लॉगिन आवश्यक"
                titleEn="Login Required"
                description="ऑर्डर पाहण्यासाठी कृपया लॉगिन करा"
                descriptionEn="Please login to view your orders"
              />
            )}
          </TabsContent>

          {/* Sell Tab */}
          <TabsContent value="sell" className="mt-0">
            {user ? (
              <SellerDashboard sellerId={user.id} />
            ) : (
              <EmptyStateCard
                icon={Store}
                title="विक्रेता व्हा"
                titleEn="Become a Seller"
                description="आपली उत्पादने विकण्यासाठी लॉगिन करा"
                descriptionEn="Login to start selling your products"
              />
            )}
          </TabsContent>
        </Tabs>
      </div>

      {selectedProduct && (
        <ProductDetails
          productId={selectedProduct}
          onClose={() => setSelectedProduct(null)}
          onAddToCart={addToCart}
          isInWishlist={wishlistItems.includes(selectedProduct)}
          onToggleWishlist={toggleWishlist}
        />
      )}

      <ShoppingCart
        open={cartOpen}
        onClose={() => setCartOpen(false)}
        cartItems={cartItems}
        onUpdateQuantity={async (itemId, quantity) => {
          await supabase
            .from('cart_items')
            .update({ quantity })
            .eq('id', itemId);
          fetchCartItems();
        }}
        onRemoveItem={async (itemId) => {
          await supabase
            .from('cart_items')
            .delete()
            .eq('id', itemId);
          fetchCartItems();
        }}
      />
    </div>
  );
}

// Empty state component for consistent UX
function EmptyStateCard({ 
  icon: Icon, 
  title, 
  titleEn, 
  description, 
  descriptionEn 
}: { 
  icon: React.ElementType;
  title: string;
  titleEn: string;
  description: string;
  descriptionEn: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "text-center py-16 px-6",
        "bg-gradient-to-br from-card/80 via-card/60 to-muted/30",
        "rounded-3xl border border-border/50",
        "backdrop-blur-xl"
      )}
    >
      <div className="p-4 rounded-2xl bg-primary/10 w-fit mx-auto mb-4">
        <Icon className="w-10 h-10 text-primary" />
      </div>
      <h3 className="text-xl font-bold mb-1 text-foreground">{title}</h3>
      <p className="text-sm text-muted-foreground mb-2">{titleEn}</p>
      <p className="text-sm text-muted-foreground max-w-md mx-auto">{description}</p>
      <p className="text-xs text-muted-foreground/70 mt-1">{descriptionEn}</p>
    </motion.div>
  );
}
