import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { Package, Truck, CheckCircle, Clock } from 'lucide-react';

interface OrderManagementProps {
  userId?: string;
}

export function OrderManagement({ userId }: OrderManagementProps) {
  const [orders, setOrders] = useState<any[]>([]);

  useEffect(() => {
    if (userId) {
      fetchOrders();
    }
  }, [userId]);

  const fetchOrders = async () => {
    const { data } = await supabase
      .from('marketplace_orders')
      .select(`
        *,
        seller:farmers!marketplace_orders_seller_id_fkey(name, store_name),
        items:order_items(*, product:marketplace_products(name, images))
      `)
      .eq('buyer_id', userId)
      .order('created_at', { ascending: false });

    if (data) {
      setOrders(data);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending': return <Clock className="w-4 h-4" />;
      case 'processing': return <Package className="w-4 h-4" />;
      case 'shipped': return <Truck className="w-4 h-4" />;
      case 'delivered': return <CheckCircle className="w-4 h-4" />;
      default: return null;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'secondary';
      case 'processing': return 'default';
      case 'shipped': return 'default';
      case 'delivered': return 'default';
      case 'cancelled': return 'destructive';
      default: return 'secondary';
    }
  };

  if (!userId) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Please login to view your orders</p>
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <div className="text-center py-12">
        <Package className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
        <h3 className="text-lg font-semibold mb-2">No orders yet</h3>
        <p className="text-muted-foreground">Start shopping to see your orders here</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {orders.map((order) => (
        <Card key={order.id}>
          <CardHeader>
            <div className="flex justify-between items-start">
              <div>
                <CardTitle className="text-lg">Order {order.order_number}</CardTitle>
                <p className="text-sm text-muted-foreground">
                  {new Date(order.created_at).toLocaleDateString()}
                </p>
              </div>
              <Badge variant={getStatusColor(order.order_status)}>
                <span className="flex items-center gap-1">
                  {getStatusIcon(order.order_status)}
                  {order.order_status}
                </span>
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total Amount</span>
                <span className="font-semibold">₹{order.total_amount}</span>
              </div>
              {order.tracking_number && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Tracking</span>
                  <span className="font-mono text-sm">{order.tracking_number}</span>
                </div>
              )}
              <Button className="w-full" variant="outline">View Details</Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}