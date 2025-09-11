import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Heart, ShoppingCart, Star, MapPin } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Product {
  id: string;
  name: string;
  description?: string;
  price: number;
  discount_price?: number;
  unit: string;
  images: any[];
  status: string;
  featured: boolean;
  seller?: {
    name: string;
    store_name?: string;
    seller_rating?: number;
    seller_verified?: boolean;
  };
  category?: {
    name: string;
    icon?: string;
  };
}

interface ProductGridProps {
  products: Product[];
  loading: boolean;
  wishlistItems: string[];
  onProductClick: (productId: string) => void;
  onAddToCart: (productId: string) => void;
  onToggleWishlist: (productId: string) => void;
}

export function ProductGrid({
  products,
  loading,
  wishlistItems,
  onProductClick,
  onAddToCart,
  onToggleWishlist
}: ProductGridProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {[...Array(8)].map((_, i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-48 w-full" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-4 w-3/4 mb-2" />
              <Skeleton className="h-4 w-1/2" />
            </CardContent>
            <CardFooter>
              <Skeleton className="h-8 w-full" />
            </CardFooter>
          </Card>
        ))}
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">No products found</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {products.map((product) => (
        <Card key={product.id} className="overflow-hidden hover:shadow-lg transition-shadow cursor-pointer">
          <div className="relative">
            {product.featured && (
              <Badge className="absolute top-2 left-2 z-10">Featured</Badge>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-2 right-2 z-10"
              onClick={(e) => {
                e.stopPropagation();
                onToggleWishlist(product.id);
              }}
            >
              <Heart
                className={cn(
                  "w-5 h-5",
                  wishlistItems.includes(product.id) && "fill-destructive text-destructive"
                )}
              />
            </Button>
            
            <div 
              className="aspect-square bg-muted relative overflow-hidden"
              onClick={() => onProductClick(product.id)}
            >
              {product.images?.[0] ? (
                <img
                  src={product.images[0]}
                  alt={product.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <ShoppingCart className="w-12 h-12 text-muted-foreground" />
                </div>
              )}
            </div>
          </div>

          <CardHeader className="pb-3">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <h3 className="font-semibold text-lg line-clamp-1">{product.name}</h3>
                {product.category && (
                  <p className="text-sm text-muted-foreground flex items-center gap-1">
                    {product.category.icon && <span>{product.category.icon}</span>}
                    {product.category.name}
                  </p>
                )}
              </div>
            </div>
          </CardHeader>

          <CardContent className="pt-0 pb-3">
            <div className="flex items-baseline gap-2">
              {product.discount_price ? (
                <>
                  <span className="text-xl font-bold">₹{product.discount_price}</span>
                  <span className="text-sm text-muted-foreground line-through">
                    ₹{product.price}
                  </span>
                </>
              ) : (
                <span className="text-xl font-bold">₹{product.price}</span>
              )}
              <span className="text-sm text-muted-foreground">/{product.unit}</span>
            </div>
            
            {product.seller && (
              <div className="mt-2 space-y-1">
                <p className="text-sm text-muted-foreground">
                  {product.seller.store_name || product.seller.name}
                </p>
                {product.seller.seller_rating && product.seller.seller_rating > 0 && (
                  <div className="flex items-center gap-1">
                    <Star className="w-3 h-3 fill-yellow-500 text-yellow-500" />
                    <span className="text-xs">{product.seller.seller_rating.toFixed(1)}</span>
                    {product.seller.seller_verified && (
                      <Badge variant="secondary" className="text-xs h-4 px-1">
                        Verified
                      </Badge>
                    )}
                  </div>
                )}
              </div>
            )}
          </CardContent>

          <CardFooter>
            <Button
              className="w-full"
              onClick={(e) => {
                e.stopPropagation();
                onAddToCart(product.id);
              }}
            >
              <ShoppingCart className="w-4 h-4 mr-2" />
              Add to Cart
            </Button>
          </CardFooter>
        </Card>
      ))}
    </div>
  );
}