import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingUp, TrendingDown } from 'lucide-react';

export default function Market() {
  const { t } = useTranslation();

  const marketData = [
    { crop: 'Wheat', price: 2125, change: 2.5, unit: 'quintal' },
    { crop: 'Rice', price: 1950, change: -1.2, unit: 'quintal' },
    { crop: 'Cotton', price: 6200, change: 3.8, unit: 'quintal' },
    { crop: 'Soybean', price: 4500, change: -0.5, unit: 'quintal' },
    { crop: 'Maize', price: 1850, change: 1.8, unit: 'quintal' },
  ];

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-2xl font-bold text-foreground">{t('nav.market')}</h1>
      
      <Card>
        <CardHeader>
          <CardTitle>{t('home.marketPrices')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {marketData.map((item) => (
            <div key={item.crop} className="flex items-center justify-between p-3 bg-muted rounded-lg">
              <div>
                <p className="font-medium text-foreground">{item.crop}</p>
                <p className="text-sm text-muted-foreground">per {item.unit}</p>
              </div>
              <div className="text-right">
                <p className="font-semibold text-lg">₹{item.price}</p>
                <div className={`flex items-center justify-end gap-1 text-sm ${
                  item.change > 0 ? 'text-success' : 'text-destructive'
                }`}>
                  {item.change > 0 ? (
                    <TrendingUp className="w-3 h-3" />
                  ) : (
                    <TrendingDown className="w-3 h-3" />
                  )}
                  <span>{Math.abs(item.change)}%</span>
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}