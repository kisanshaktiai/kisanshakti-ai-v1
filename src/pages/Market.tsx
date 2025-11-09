import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';
import { MarketplaceHeader } from '@/components/marketplace/MarketplaceHeader';
import { CategoryFilter } from '@/components/marketplace/CategoryFilter';
import { ProductGrid } from '@/components/marketplace/ProductGrid';
import { ProductDetails } from '@/components/marketplace/ProductDetails';
import { ShoppingCart } from '@/components/marketplace/ShoppingCart';
import { SellerDashboard } from '@/components/marketplace/SellerDashboard';
import { OrderManagement } from '@/components/marketplace/OrderManagement';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Package, ShoppingBag, Store, TrendingUp } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuthStore } from '@/stores/authStore';
import { MarketSkeleton } from '@/components/skeletons';

export default function Market() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { user } = useAuthStore();
  const [activeTab, setActiveTab] = useState('browse');
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
      // @ts-ignore - Type inference issue with Supabase query
      const { data, error } = await supabase
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
        title: "Please login",
        description: "You need to login to add items to cart",
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
        title: "Added to cart",
        description: "Product has been added to your cart"
      });
      fetchCartItems();
    }
  };

  const toggleWishlist = async (productId: string) => {
    if (!user) {
      toast({
        title: "Please login",
        description: "You need to login to add items to wishlist",
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

  if (loading && products.length === 0) {
    return <MarketSkeleton />;
  }

  return (
    <div className="min-h-screen bg-background">
      <MarketplaceHeader 
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onCartClick={() => setCartOpen(true)}
        cartItemCount={cartItems.length}
      />

      <div className="container mx-auto px-4 py-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-4 mb-6">
            <TabsTrigger value="browse" className="flex items-center gap-2">
              <ShoppingBag className="w-4 h-4" />
              Browse
            </TabsTrigger>
            <TabsTrigger value="orders" className="flex items-center gap-2">
              <Package className="w-4 h-4" />
              My Orders
            </TabsTrigger>
            <TabsTrigger value="sell" className="flex items-center gap-2">
              <Store className="w-4 h-4" />
              Sell
            </TabsTrigger>
            <TabsTrigger value="analytics" className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4" />
              Analytics
            </TabsTrigger>
          </TabsList>

          <TabsContent value="browse" className="space-y-6">
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
          </TabsContent>

          <TabsContent value="orders">
            <OrderManagement userId={user?.id} />
          </TabsContent>

          <TabsContent value="sell">
            <SellerDashboard sellerId={user?.id} />
          </TabsContent>

          <TabsContent value="analytics">
            <div className="text-center py-12">
              <h3 className="text-lg font-semibold mb-2">Analytics Dashboard</h3>
              <p className="text-muted-foreground">View your sales analytics and performance metrics</p>
            </div>
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