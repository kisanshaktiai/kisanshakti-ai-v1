import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { supabase } from '@/integrations/supabase/client';
import { CategoryFilter } from '@/components/marketplace/CategoryFilter';
import { ProductGrid } from '@/components/marketplace/ProductGrid';
import { ProductDetails } from '@/components/marketplace/ProductDetails';
import { ShoppingCart } from '@/components/marketplace/ShoppingCart';
import { SellerDashboard } from '@/components/marketplace/SellerDashboard';
import { OrderManagement } from '@/components/marketplace/OrderManagement';
import { MarketPriceIntelligence } from '@/components/market-intelligence';
import { MarketHome } from '@/components/marketplace/home/MarketHome';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Package, ShoppingBag, Store } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuthStore } from '@/stores/authStore';
import { MarketSkeleton } from '@/components/skeletons';
import { cn } from '@/lib/utils';

type View = 'home' | 'prices' | 'shop' | 'orders' | 'sell';

export default function Market() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { user } = useAuthStore();
  const [searchParams, setSearchParams] = useSearchParams();
  const view = (searchParams.get('view') as View) || 'home';
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<string | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [searchQuery] = useState('');
  const [products, setProducts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [cartItems, setCartItems] = useState<any[]>([]);
  const [wishlistItems, setWishlistItems] = useState<any[]>([]);

  useEffect(() => {
    if (view === 'shop') {
      fetchCategories();
      fetchProducts();
    }
    if (user) {
      fetchCartItems();
      fetchWishlist();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, view]);

  useEffect(() => {
    if (view === 'shop') fetchProducts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCategory, searchQuery]);

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
      .select(`*, product:marketplace_products(*, seller:farmers!marketplace_products_seller_id_fkey(name, store_name))`)
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
    const { error } = await supabase.from('cart_items').upsert({
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
      await supabase.from('wishlist_items').delete().eq('user_id', user.id).eq('product_id', productId);
      setWishlistItems(wishlistItems.filter((id) => id !== productId));
    } else {
      await supabase.from('wishlist_items').insert({ user_id: user.id, product_id: productId });
      setWishlistItems([...wishlistItems, productId]);
    }
  };

  const goHome = () => setSearchParams({});

  // HOME (bento) view ----------------------------------------------------------
  if (view === 'home') {
    return (
      <>
        <MarketHome cartItemCount={cartItems.length} onCartClick={() => setCartOpen(true)} />
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
      </>
    );
  }

  // SUB-VIEWS ------------------------------------------------------------------
  return (
    <div
      className="min-h-full pb-nav-safe"
      style={{ backgroundColor: 'hsl(var(--market-bg))', color: 'hsl(var(--market-ink))' }}
    >
      <SubViewHeader title={subViewTitle(view)} onBack={goHome} />

      <div className="max-w-screen-sm mx-auto px-3 py-3 space-y-3">
        {view === 'prices' && <MarketPriceIntelligence />}

        {view === 'shop' &&
          (loading && products.length === 0 ? (
            <MarketSkeleton />
          ) : products.length > 0 ? (
            <div className="space-y-3">
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
            </div>
          ) : (
            <EmptyStateCard
              icon={ShoppingBag}
              title="बाजारपेठ लवकरच"
              titleEn="Marketplace coming soon"
              description="शेतकऱ्यांसाठी उत्पादने लवकरच उपलब्ध होतील"
              descriptionEn="Products for farmers will be available soon"
            />
          ))}

        {view === 'orders' &&
          (user ? (
            <OrderManagement userId={user.id} />
          ) : (
            <EmptyStateCard
              icon={Package}
              title="लॉगिन आवश्यक"
              titleEn="Login required"
              description="ऑर्डर पाहण्यासाठी कृपया लॉगिन करा"
              descriptionEn="Please login to view your orders"
            />
          ))}

        {view === 'sell' &&
          (user ? (
            <SellerDashboard sellerId={user.id} />
          ) : (
            <EmptyStateCard
              icon={Store}
              title="विक्रेता व्हा"
              titleEn="Become a seller"
              description="आपली उत्पादने विकण्यासाठी लॉगिन करा"
              descriptionEn="Login to start selling your products"
            />
          ))}
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

function subViewTitle(v: View) {
  switch (v) {
    case 'prices':
      return { hi: 'भाव', en: 'Mandi Prices' };
    case 'shop':
      return { hi: 'खरीदें', en: 'Shop' };
    case 'orders':
      return { hi: 'ऑर्डर', en: 'My Orders' };
    case 'sell':
      return { hi: 'विक्री', en: 'Sell' };
    default:
      return { hi: '', en: '' };
  }
}

function SubViewHeader({
  title,
  onBack,
}: {
  title: { hi: string; en: string };
  onBack: () => void;
}) {
  return (
    <header
      className="sticky top-0 z-30 px-3 py-3"
      style={{
        backgroundColor: 'hsl(var(--market-bg))',
        borderBottom: '1px solid hsl(var(--market-line) / 0.6)',
      }}
    >
      <div className="max-w-screen-sm mx-auto flex items-center gap-2">
        <button
          aria-label="Back"
          onClick={onBack}
          className="min-h-11 min-w-11 rounded-2xl flex items-center justify-center"
          style={{
            backgroundColor: 'hsl(var(--market-surface))',
            border: '1px solid hsl(var(--market-line))',
            color: 'hsl(var(--market-ink))',
          }}
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-base font-extrabold" style={{ color: 'hsl(var(--market-ink))' }}>
            {title.hi}
          </h1>
          <p className="text-[11px]" style={{ color: 'hsl(var(--market-ink-soft))' }}>
            {title.en}
          </p>
        </div>
      </div>
    </header>
  );
}

function EmptyStateCard({
  icon: Icon,
  title,
  titleEn,
  description,
  descriptionEn,
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
      className={cn('text-center py-16 px-6 rounded-3xl')}
      style={{
        backgroundColor: 'hsl(var(--market-surface))',
        border: '1px solid hsl(var(--market-line))',
      }}
    >
      <div
        className="p-4 rounded-2xl w-fit mx-auto mb-4"
        style={{
          backgroundColor: 'hsl(var(--market-primary-soft) / 0.3)',
          color: 'hsl(var(--market-primary))',
        }}
      >
        <Icon className="w-10 h-10" />
      </div>
      <h3 className="text-xl font-bold mb-1" style={{ color: 'hsl(var(--market-ink))' }}>
        {title}
      </h3>
      <p className="text-sm" style={{ color: 'hsl(var(--market-ink-soft))' }}>
        {titleEn}
      </p>
      <p className="text-sm max-w-md mx-auto mt-3" style={{ color: 'hsl(var(--market-ink-soft))' }}>
        {description}
      </p>
      <p className="text-xs mt-1" style={{ color: 'hsl(var(--market-ink-soft) / 0.8)' }}>
        {descriptionEn}
      </p>
    </motion.div>
  );
}
