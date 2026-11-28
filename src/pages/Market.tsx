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
import { MarketPriceIntelligence } from '@/components/market-intelligence';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  TrendingUp,
  ShoppingBag,
  Package,
  Store,
  ShoppingCart as CartIcon,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuthStore } from '@/stores/authStore';
import { MarketSkeleton } from '@/components/skeletons';
import '@/living/living.css';

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

    if (!error) setCategories(data || []);
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

    if (selectedCategory) query = query.eq('category_id', selectedCategory);
    if (searchQuery) query = query.ilike('name', `%${searchQuery}%`);

    const { data, error } = await query.order('featured', { ascending: false });

    if (!error) setProducts(data || []);
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
    if (data) setCartItems(data);
  };

  const fetchWishlist = async () => {
    if (!user) return;
    try {
      const client: any = supabase;
      const { data, error } = await client
        .from('wishlist_items')
        .select('product_id')
        .eq('farmer_id', user.id);
      if (!error && data) setWishlistItems(data.map((i: any) => i.product_id));
    } catch (err) {
      console.error('Error fetching wishlist:', err);
    }
  };

  const addToCart = async (productId: string, quantity: number = 1) => {
    if (!user) {
      toast({
        title: t('market.auth.login_required.title'),
        description: t('market.auth.login_required.cart'),
        variant: 'destructive',
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
        unit_price: 0,
      });
    if (!error) {
      toast({
        title: t('market.cart.added.title'),
        description: t('market.cart.added.message'),
      });
      fetchCartItems();
    }
  };

  const toggleWishlist = async (productId: string) => {
    if (!user) {
      toast({
        title: t('market.auth.login_required.title'),
        description: t('market.auth.login_required.wishlist'),
        variant: 'destructive',
      });
      return;
    }
    if (wishlistItems.includes(productId)) {
      await supabase.from('wishlist_items').delete()
        .eq('user_id', user.id).eq('product_id', productId);
      setWishlistItems(wishlistItems.filter((id) => id !== productId));
    } else {
      await supabase.from('wishlist_items')
        .insert({ user_id: user.id, product_id: productId });
      setWishlistItems([...wishlistItems, productId]);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, [selectedCategory, searchQuery]);

  if (loading && products.length === 0 && activeTab !== 'prices') {
    return <MarketSkeleton />;
  }

  const tabs = [
    { id: 'prices', icon: TrendingUp, label: t('market.ui.tab_prices') },
    { id: 'browse', icon: ShoppingBag, label: t('market.ui.tab_shop') },
    { id: 'orders', icon: Package, label: t('market.ui.tab_orders') },
    { id: 'sell', icon: Store, label: t('market.ui.tab_sell') },
  ];

  return (
    <div className="min-h-full bg-background" style={{ fontSize: 'var(--lf-fs-body)' }}>
      {/* Sticky header: title + cart */}
      <header className="sticky top-0 z-30 border-b border-border bg-background">
        <div className="mx-auto flex max-w-screen-md items-center justify-between gap-3 py-2" style={{ padding: '8px var(--lf-gut)' }}>
          <h1 className="lf-head min-w-0 truncate">{t('market.ui.title')}</h1>
          <button
            type="button"
            onClick={() => setCartOpen(true)}
            className="lf-round relative border border-border bg-card text-foreground"
            aria-label={t('market.ui.open_cart')}
          >
            <CartIcon size={22} aria-hidden />
            {cartItems.length > 0 && (
              <span className="lf-cap absolute -right-1 -top-1 flex h-6 min-w-6 items-center justify-center rounded-full bg-primary px-1 font-bold text-primary-foreground">
                {cartItems.length}
              </span>
            )}
          </button>
        </div>

        {/* Four equal tabs, icon over word */}
        <div className="mx-auto max-w-screen-md" style={{ padding: '0 var(--lf-gut) 10px' }}>
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid h-auto w-full grid-cols-4 gap-1 rounded-[var(--lf-r)] border border-border bg-muted p-1">
              {tabs.map((tab) => (
                <TabsTrigger
                  key={tab.id}
                  value={tab.id}
                  className="lf-cap flex min-w-0 flex-col items-center justify-center gap-1 rounded-2xl px-1 font-bold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm"
                  style={{ minHeight: 'var(--lf-tap)' }}
                >
                  <tab.icon size={20} aria-hidden />
                  <span className="w-full truncate leading-tight">{tab.label}</span>
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>
      </header>

      <div className="mx-auto max-w-screen-md py-3" style={{ padding: '12px var(--lf-gut)' }}>
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsContent value="prices" className="mt-0 focus-visible:outline-none">
            <MarketPriceIntelligence />
          </TabsContent>

          <TabsContent value="browse" className="mt-0 space-y-4 focus-visible:outline-none">
            <MarketplaceHeader
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              onCartClick={() => setCartOpen(true)}
              cartItemCount={cartItems.length}
            />
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
              <EmptyStateCard icon={ShoppingBag} title={t('market.ui.soon_title')} description={t('market.ui.soon_body')} />
            )}
          </TabsContent>

          <TabsContent value="orders" className="mt-0 focus-visible:outline-none">
            {user ? (
              <OrderManagement userId={user.id} />
            ) : (
              <EmptyStateCard icon={Package} title={t('market.ui.login_title')} description={t('market.ui.login_orders')} />
            )}
          </TabsContent>

          <TabsContent value="sell" className="mt-0 focus-visible:outline-none">
            {user ? (
              <SellerDashboard sellerId={user.id} />
            ) : (
              <EmptyStateCard icon={Store} title={t('market.ui.seller_title')} description={t('market.ui.login_sell')} />
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
          await supabase.from('cart_items').update({ quantity }).eq('id', itemId);
          fetchCartItems();
        }}
        onRemoveItem={async (itemId) => {
          await supabase.from('cart_items').delete().eq('id', itemId);
          fetchCartItems();
        }}
      />
    </div>
  );
}

function EmptyStateCard({ icon: Icon, title, description }: { icon: React.ElementType; title: string; description: string }) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-12 text-center">
      <span className="grid h-20 w-20 place-items-center rounded-[32%] bg-primary/10 text-primary"><Icon className="h-10 w-10" aria-hidden /></span>
      <h2 className="lf-head mt-2">{title}</h2>
      <p className="lf-lab max-w-xs font-normal text-muted-foreground">{description}</p>
    </div>
  );
}
