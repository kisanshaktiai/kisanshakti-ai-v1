import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Heart, ShoppingCart, Star, MapPin, MessageCircle, Share2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

interface ProductDetailsProps {
  productId: string;
  onClose: () => void;
  onAddToCart: (productId: string, quantity: number) => void;
  isInWishlist: boolean;
  onToggleWishlist: (productId: string) => void;
}

export function ProductDetails({
  productId,
  onClose,
  onAddToCart,
  isInWishlist,
  onToggleWishlist
}: ProductDetailsProps) {
  const [product, setProduct] = useState<any>(null);
  const [quantity, setQuantity] = useState(1);
  const [selectedImage, setSelectedImage] = useState(0);
  const [reviews, setReviews] = useState<any[]>([]);

  useEffect(() => {
    fetchProductDetails();
    fetchReviews();
  }, [productId]);

  const fetchProductDetails = async () => {
    const { data } = await supabase
      .from('marketplace_products')
      .select(`
        *,
        seller:farmers!marketplace_products_seller_id_fkey(
          id, name, store_name, seller_rating, seller_verified, store_description
        ),
        category:marketplace_categories(name, icon)
      `)
      .eq('id', productId)
      .single();

    if (data) {
      setProduct(data);
    }
  };

  const fetchReviews = async () => {
    const { data } = await supabase
      .from('product_reviews')
      .select('*, buyer:buyer_id(name)')
      .eq('product_id', productId)
      .order('created_at', { ascending: false })
      .limit(10);

    if (data) {
      setReviews(data);
    }
  };

  if (!product) return null;

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden p-0">
        <div className="grid md:grid-cols-2 h-full">
          <div className="p-6 space-y-4">
            <div className="aspect-square bg-muted rounded-lg overflow-hidden">
              {product.images?.[selectedImage] ? (
                <img
                  src={product.images[selectedImage]}
                  alt={product.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <ShoppingCart className="w-16 h-16 text-muted-foreground" />
                </div>
              )}
            </div>
            
            {product.images?.length > 1 && (
              <div className="flex gap-2 overflow-x-auto">
                {product.images.map((image: string, index: number) => (
                  <button
                    key={index}
                    onClick={() => setSelectedImage(index)}
                    className={cn(
                      "w-16 h-16 rounded-md overflow-hidden border-2",
                      selectedImage === index ? "border-primary" : "border-transparent"
                    )}
                  >
                    <img src={image} alt="" className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>

          <ScrollArea className="h-full">
            <div className="p-6 space-y-4">
              <div>
                <div className="flex items-start justify-between mb-2">
                  <h2 className="text-2xl font-bold">{product.name}</h2>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onToggleWishlist(productId)}
                  >
                    <Heart
                      className={cn(
                        "w-5 h-5",
                        isInWishlist && "fill-destructive text-destructive"
                      )}
                    />
                  </Button>
                </div>
                
                {product.category && (
                  <Badge variant="secondary" className="mb-2">
                    {product.category.icon} {product.category.name}
                  </Badge>
                )}
                
                <div className="flex items-baseline gap-2 mt-3">
                  {product.discount_price ? (
                    <>
                      <span className="text-3xl font-bold">₹{product.discount_price}</span>
                      <span className="text-lg text-muted-foreground line-through">
                        ₹{product.price}
                      </span>
                    </>
                  ) : (
                    <span className="text-3xl font-bold">₹{product.price}</span>
                  )}
                  <span className="text-muted-foreground">/{product.unit}</span>
                </div>
              </div>

              <Tabs defaultValue="details" className="w-full">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="details">Details</TabsTrigger>
                  <TabsTrigger value="seller">Seller</TabsTrigger>
                  <TabsTrigger value="reviews">Reviews</TabsTrigger>
                </TabsList>
                
                <TabsContent value="details" className="space-y-4">
                  <div>
                    <h3 className="font-semibold mb-2">Description</h3>
                    <p className="text-muted-foreground">
                      {product.description || "No description available"}
                    </p>
                  </div>
                  
                  {product.specifications && Object.keys(product.specifications).length > 0 && (
                    <div>
                      <h3 className="font-semibold mb-2">Specifications</h3>
                      <dl className="space-y-1">
                        {Object.entries(product.specifications).map(([key, value]) => (
                          <div key={key} className="flex justify-between py-1 border-b">
                            <dt className="text-muted-foreground">{key}</dt>
                            <dd className="font-medium">{String(value)}</dd>
                          </div>
                        ))}
                      </dl>
                    </div>
                  )}
                </TabsContent>
                
                <TabsContent value="seller" className="space-y-4">
                  {product.seller && (
                    <>
                      <div>
                        <h3 className="font-semibold text-lg">
                          {product.seller.store_name || product.seller.name}
                        </h3>
                        {product.seller.seller_rating && product.seller.seller_rating > 0 && (
                          <div className="flex items-center gap-2 mt-1">
                            <div className="flex items-center">
                              <Star className="w-4 h-4 fill-yellow-500 text-yellow-500" />
                              <span className="ml-1">{product.seller.seller_rating.toFixed(1)}</span>
                            </div>
                            {product.seller.seller_verified && (
                              <Badge variant="secondary">Verified Seller</Badge>
                            )}
                          </div>
                        )}
                      </div>
                      
                      {product.seller.store_description && (
                        <p className="text-muted-foreground">
                          {product.seller.store_description}
                        </p>
                      )}
                      
                      <Button variant="outline" className="w-full">
                        <MessageCircle className="w-4 h-4 mr-2" />
                        Contact Seller
                      </Button>
                    </>
                  )}
                </TabsContent>
                
                <TabsContent value="reviews" className="space-y-4">
                  {reviews.length > 0 ? (
                    reviews.map((review) => (
                      <div key={review.id} className="border-b pb-3">
                        <div className="flex items-center gap-2 mb-1">
                          <div className="flex">
                            {[...Array(5)].map((_, i) => (
                              <Star
                                key={i}
                                className={cn(
                                  "w-3 h-3",
                                  i < review.rating
                                    ? "fill-yellow-500 text-yellow-500"
                                    : "text-muted-foreground"
                                )}
                              />
                            ))}
                          </div>
                          <span className="text-sm text-muted-foreground">
                            {new Date(review.created_at).toLocaleDateString()}
                          </span>
                        </div>
                        <p className="text-sm">{review.comment}</p>
                      </div>
                    ))
                  ) : (
                    <p className="text-center text-muted-foreground">No reviews yet</p>
                  )}
                </TabsContent>
              </Tabs>

              <div className="space-y-3 pt-4">
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setQuantity(Math.max(1, quantity - 1))}
                  >
                    -
                  </Button>
                  <span className="w-12 text-center font-semibold">{quantity}</span>
                  <Button
                    variant="outline"
                    onClick={() => setQuantity(quantity + 1)}
                  >
                    +
                  </Button>
                  <span className="text-sm text-muted-foreground ml-2">
                    {product.unit}
                  </span>
                </div>
                
                <Button
                  className="w-full"
                  size="lg"
                  onClick={() => {
                    onAddToCart(productId, quantity);
                    onClose();
                  }}
                >
                  <ShoppingCart className="w-5 h-5 mr-2" />
                  Add to Cart
                </Button>
              </div>
            </div>
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  );
}