import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Trash2, Plus, Minus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface CartItem {
  id: string;
  quantity: number;
  product: {
    id: string;
    name: string;
    price: number;
    discount_price?: number;
    unit: string;
    images?: any[];
    seller?: {
      name: string;
      store_name?: string;
    };
  };
}

interface ShoppingCartProps {
  open: boolean;
  onClose: () => void;
  cartItems: CartItem[];
  onUpdateQuantity: (itemId: string, quantity: number) => void;
  onRemoveItem: (itemId: string) => void;
}

export function ShoppingCart({
  open,
  onClose,
  cartItems,
  onUpdateQuantity,
  onRemoveItem
}: ShoppingCartProps) {
  const navigate = useNavigate();

  const calculateTotal = () => {
    return cartItems.reduce((total, item) => {
      const price = item.product.discount_price || item.product.price;
      return total + (price * item.quantity);
    }, 0);
  };

  const handleCheckout = () => {
    onClose();
    navigate('/app/checkout');
  };

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Shopping Cart ({cartItems.length} items)</SheetTitle>
        </SheetHeader>

        <ScrollArea className="flex-1 my-4 pr-4">
          {cartItems.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground">Your cart is empty</p>
              <Button className="mt-4" onClick={onClose}>
                Continue Shopping
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {cartItems.map((item) => (
                <div key={item.id} className="flex gap-3 py-3 border-b">
                  <div className="w-20 h-20 bg-muted rounded-md overflow-hidden">
                    {item.product.images?.[0] ? (
                      <img
                        src={item.product.images[0]}
                        alt={item.product.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full bg-muted" />
                    )}
                  </div>

                  <div className="flex-1 space-y-1">
                    <h4 className="font-medium line-clamp-1">{item.product.name}</h4>
                    <p className="text-sm text-muted-foreground">
                      {item.product.seller?.store_name || item.product.seller?.name}
                    </p>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => onUpdateQuantity(item.id, Math.max(1, item.quantity - 1))}
                        >
                          <Minus className="w-3 h-3" />
                        </Button>
                        <span className="w-8 text-center text-sm">{item.quantity}</span>
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => onUpdateQuantity(item.id, item.quantity + 1)}
                        >
                          <Plus className="w-3 h-3" />
                        </Button>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold">
                          ₹{((item.product.discount_price || item.product.price) * item.quantity).toFixed(2)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          ₹{item.product.discount_price || item.product.price}/{item.product.unit}
                        </p>
                      </div>
                    </div>
                  </div>

                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => onRemoveItem(item.id)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>

        {cartItems.length > 0 && (
          <SheetFooter className="flex-col gap-4">
            <Separator />
            <div className="flex justify-between items-center w-full">
              <span className="text-lg font-semibold">Total</span>
              <span className="text-2xl font-bold">₹{calculateTotal().toFixed(2)}</span>
            </div>
            <Button className="w-full" size="lg" onClick={handleCheckout}>
              Proceed to Checkout
            </Button>
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  );
}