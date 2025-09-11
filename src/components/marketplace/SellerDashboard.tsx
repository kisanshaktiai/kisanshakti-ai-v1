import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, Package, TrendingUp, DollarSign, Users } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { AddProductDialog } from './AddProductDialog';
import { ProductList } from './ProductList';

interface SellerDashboardProps {
  sellerId?: string;
}

export function SellerDashboard({ sellerId }: SellerDashboardProps) {
  const [products, setProducts] = useState<any[]>([]);
  const [stats, setStats] = useState({
    totalProducts: 0,
    totalSales: 0,
    totalRevenue: 0,
    averageRating: 0
  });
  const [isAddProductOpen, setIsAddProductOpen] = useState(false);

  useEffect(() => {
    if (sellerId) {
      fetchSellerProducts();
      fetchSellerStats();
    }
  }, [sellerId]);

  const fetchSellerProducts = async () => {
    const { data } = await supabase
      .from('marketplace_products')
      .select('*')
      .eq('seller_id', sellerId)
      .order('created_at', { ascending: false });

    if (data) {
      setProducts(data);
    }
  };

  const fetchSellerStats = async () => {
    // Fetch seller statistics
    const { data: farmer } = await supabase
      .from('farmers')
      .select('total_sales, seller_rating')
      .eq('id', sellerId)
      .single();

    if (farmer) {
      setStats({
        totalProducts: products.length,
        totalSales: farmer.total_sales || 0,
        totalRevenue: 0, // Calculate from orders
        averageRating: farmer.seller_rating || 0
      });
    }
  };

  if (!sellerId) {
    return (
      <div className="text-center py-12">
        <h3 className="text-lg font-semibold mb-2">Become a Seller</h3>
        <p className="text-muted-foreground mb-4">Start selling your products on our marketplace</p>
        <Button>Register as Seller</Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Seller Dashboard</h2>
        <Button onClick={() => setIsAddProductOpen(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Add Product
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Products</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalProducts}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Sales</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalSales}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">₹{stats.totalRevenue}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Rating</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.averageRating.toFixed(1)}</div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="products" className="w-full">
        <TabsList>
          <TabsTrigger value="products">Products</TabsTrigger>
          <TabsTrigger value="orders">Orders</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
        </TabsList>

        <TabsContent value="products">
          <ProductList products={products} onRefresh={fetchSellerProducts} />
        </TabsContent>

        <TabsContent value="orders">
          <div className="text-center py-8">
            <p className="text-muted-foreground">Order management coming soon</p>
          </div>
        </TabsContent>

        <TabsContent value="analytics">
          <div className="text-center py-8">
            <p className="text-muted-foreground">Analytics dashboard coming soon</p>
          </div>
        </TabsContent>
      </Tabs>

      {isAddProductOpen && (
        <AddProductDialog
          open={isAddProductOpen}
          onClose={() => setIsAddProductOpen(false)}
          sellerId={sellerId}
          onSuccess={fetchSellerProducts}
        />
      )}
    </div>
  );
}