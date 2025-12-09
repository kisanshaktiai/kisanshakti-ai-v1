import React from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  Leaf, 
  FlaskConical, 
  Bug, 
  Sparkles, 
  Droplets,
  Clock,
  CloudRain,
  Shield,
  IndianRupee,
  AlertTriangle,
  Users
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLanguageStore } from '@/stores/languageStore';

interface ProductRecommendation {
  product_name: string;
  product_type?: string;
  active_ingredient?: string;
  dose_per_acre?: string;
  application_method?: string;
  precautions?: string;
  weather_conditions?: string;
  price_estimate?: number;
  phi_days?: number;
  timing?: string;
  brand?: string;
}

interface ProductRecommendationCardProps {
  products: ProductRecommendation[];
  landAreaAcres?: number;
  laborCost?: number;
}

const productTypeConfig = {
  organic: {
    icon: Leaf,
    color: 'text-green-600',
    bgColor: 'bg-green-500/10',
    borderColor: 'border-green-500/30',
    gradient: 'from-green-500 to-emerald-500',
    label: { en: 'Organic', hi: 'जैविक', mr: 'सेंद्रिय' },
  },
  growth_promoter: {
    icon: Sparkles,
    color: 'text-blue-600',
    bgColor: 'bg-blue-500/10',
    borderColor: 'border-blue-500/30',
    gradient: 'from-blue-500 to-cyan-500',
    label: { en: 'Growth Booster', hi: 'ग्रोथ बूस्टर', mr: 'वाढ वर्धक' },
  },
  fertilizer: {
    icon: FlaskConical,
    color: 'text-amber-600',
    bgColor: 'bg-amber-500/10',
    borderColor: 'border-amber-500/30',
    gradient: 'from-amber-500 to-yellow-500',
    label: { en: 'Fertilizer', hi: 'खाद', mr: 'खत' },
  },
  pesticide: {
    icon: Bug,
    color: 'text-red-600',
    bgColor: 'bg-red-500/10',
    borderColor: 'border-red-500/30',
    gradient: 'from-red-500 to-orange-500',
    label: { en: 'Pesticide', hi: 'कीटनाशक', mr: 'कीटकनाशक' },
  },
};

export default function ProductRecommendationCard({ products, landAreaAcres = 1, laborCost = 0 }: ProductRecommendationCardProps) {
  const { currentLanguage } = useLanguageStore();
  const lang = currentLanguage || 'en';

  // Show card if either products or labor cost exists
  const hasProducts = products && products.length > 0;
  const hasLaborCost = laborCost > 0;
  
  if (!hasProducts && !hasLaborCost) return null;

  const getLabel = (labels: Record<string, string>) => labels[lang] || labels.en;

  // Calculate total product cost
  const totalProductCost = products.reduce((sum, p) => sum + (p.price_estimate || 0), 0);
  const totalCost = totalProductCost + laborCost;

  return (
    <div className="space-y-3">
      {hasProducts && (
        <>
          <h4 className="text-sm font-semibold flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            {lang === 'hi' ? 'सुझाए गए उत्पाद' : lang === 'mr' ? 'शिफारस केलेली उत्पादने' : 'Recommended Products'}
          </h4>
      
          <div className="grid gap-3">
            {products.map((product, index) => {
          const config = productTypeConfig[product.product_type] || productTypeConfig.organic;
          const ProductIcon = config.icon;
          // price_estimate already includes land area calculation from backend
          const totalPrice = product.price_estimate || 0;

          return (
            <Card
              key={index}
              className={cn(
                "relative overflow-hidden border-2 transition-all",
                config.borderColor
              )}
            >
              {/* Type indicator bar */}
              <div className={cn("absolute left-0 top-0 bottom-0 w-1.5 bg-gradient-to-b", config.gradient)} />
              
              <div className="p-4 pl-5 space-y-3">
                {/* Header */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className={cn(
                      "p-2 rounded-xl text-white shadow-md",
                      `bg-gradient-to-br ${config.gradient}`
                    )}>
                      <ProductIcon className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h5 className="font-semibold text-sm leading-tight">{product.product_name}</h5>
                      <Badge 
                        variant="outline" 
                        className={cn("mt-1 text-[10px] px-2 py-0", config.bgColor, config.borderColor, config.color)}
                      >
                        {getLabel(config.label)}
                      </Badge>
                    </div>
                  </div>
                  
                  {totalPrice > 0 && (
                    <div className="text-right shrink-0">
                      <div className="flex items-center gap-1 text-primary font-bold">
                        <IndianRupee className="h-3.5 w-3.5" />
                        <span>₹{totalPrice.toLocaleString('en-IN')}</span>
                      </div>
                      <span className="text-[10px] text-muted-foreground">
                        {lang === 'hi' ? 'अंदाजे' : lang === 'mr' ? 'अंदाजे' : 'approx'}
                      </span>
                    </div>
                  )}
                </div>

                {/* Active Ingredient */}
                {product.active_ingredient && (
                  <div className="flex items-start gap-2 text-xs">
                    <FlaskConical className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
                    <span className="text-muted-foreground">
                      <span className="font-medium text-foreground">
                        {lang === 'hi' ? 'सक्रिय तत्व:' : lang === 'mr' ? 'सक्रिय घटक:' : 'Active:'}
                      </span>{' '}
                      {product.active_ingredient}
                    </span>
                  </div>
                )}

                {/* Dose */}
                {product.dose_per_acre && (
                  <div className="flex items-start gap-2 text-xs">
                    <Droplets className="h-3.5 w-3.5 text-blue-500 shrink-0 mt-0.5" />
                    <span className="text-muted-foreground">
                      <span className="font-medium text-foreground">
                        {lang === 'hi' ? 'मात्रा:' : lang === 'mr' ? 'डोस:' : 'Dose:'}
                      </span>{' '}
                      {product.dose_per_acre}
                      {landAreaAcres > 1 && ` × ${landAreaAcres} = ${parseFloat(product.dose_per_acre) * landAreaAcres || product.dose_per_acre}`}
                    </span>
                  </div>
                )}

                {/* Application Method */}
                {product.application_method && (
                  <div className="flex items-start gap-2 text-xs">
                    <Sparkles className="h-3.5 w-3.5 text-purple-500 shrink-0 mt-0.5" />
                    <span className="text-muted-foreground">
                      <span className="font-medium text-foreground">
                        {lang === 'hi' ? 'तरीका:' : lang === 'mr' ? 'पद्धत:' : 'Method:'}
                      </span>{' '}
                      {product.application_method}
                    </span>
                  </div>
                )}

                {/* Timing */}
                {product.timing && (
                  <div className="flex items-start gap-2 text-xs">
                    <Clock className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />
                    <span className="text-muted-foreground">
                      <span className="font-medium text-foreground">
                        {lang === 'hi' ? 'समय:' : lang === 'mr' ? 'वेळ:' : 'Timing:'}
                      </span>{' '}
                      {product.timing}
                    </span>
                  </div>
                )}

                {/* Weather Conditions */}
                {product.weather_conditions && (
                  <div className="flex items-start gap-2 text-xs">
                    <CloudRain className="h-3.5 w-3.5 text-sky-500 shrink-0 mt-0.5" />
                    <span className="text-muted-foreground">
                      <span className="font-medium text-foreground">
                        {lang === 'hi' ? 'मौसम:' : lang === 'mr' ? 'हवामान:' : 'Weather:'}
                      </span>{' '}
                      {product.weather_conditions}
                    </span>
                  </div>
                )}

                {/* Precautions */}
                {product.precautions && (
                  <div className="flex items-start gap-2 p-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
                    <Shield className="h-3.5 w-3.5 text-amber-600 shrink-0 mt-0.5" />
                    <span className="text-xs text-amber-700 dark:text-amber-400">
                      {product.precautions}
                    </span>
                  </div>
                )}

                {/* PHI Days Warning for Pesticides */}
                {product.product_type === 'pesticide' && product.phi_days && (
                  <div className="flex items-start gap-2 p-2 rounded-lg bg-red-500/10 border border-red-500/20">
                    <AlertTriangle className="h-3.5 w-3.5 text-red-600 shrink-0 mt-0.5" />
                    <span className="text-xs text-red-700 dark:text-red-400">
                      {lang === 'hi' 
                        ? `⚠️ फसल काटने से ${product.phi_days} दिन पहले उपयोग बंद करें`
                        : lang === 'mr'
                        ? `⚠️ कापणीच्या ${product.phi_days} दिवस आधी वापर थांबवा`
                        : `⚠️ Stop use ${product.phi_days} days before harvest (PHI)`}
                    </span>
                  </div>
                )}
              </div>
            </Card>
          );
        })}
          </div>
        </>
      )}

      {/* Labor Cost Section */}
      {laborCost > 0 && (
        <Card className="border-2 border-purple-500/30 bg-purple-500/5">
          <div className="p-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-gradient-to-br from-purple-500 to-violet-500 text-white shadow-md">
                <Users className="h-4 w-4" />
              </div>
              <div>
                <span className="text-sm font-medium">
                  {lang === 'hi' ? 'मजदूरी खर्च' : lang === 'mr' ? 'मजुरी खर्च' : 'Labor Cost'}
                </span>
                <p className="text-[10px] text-muted-foreground">
                  {lang === 'hi' ? 'भारतीय दर अनुसार' : lang === 'mr' ? 'भारतीय दर अनुसार' : 'As per Indian rates'}
                </p>
              </div>
            </div>
            <div className="text-right">
              <div className="flex items-center gap-1 text-purple-600 font-bold">
                <IndianRupee className="h-3.5 w-3.5" />
                <span>₹{laborCost.toLocaleString('en-IN')}</span>
              </div>
              <span className="text-[10px] text-muted-foreground">
                {lang === 'hi' ? 'अंदाजे' : lang === 'mr' ? 'अंदाजे' : 'approx'}
              </span>
            </div>
          </div>
        </Card>
      )}

      {/* Total Cost Summary */}
      {totalCost > 0 && (
        <Card className="border-2 border-primary/40 bg-primary/5">
          <div className="p-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-gradient-to-br from-primary to-primary/70 text-white shadow-md">
                <IndianRupee className="h-4 w-4" />
              </div>
              <div>
                <span className="text-sm font-bold">
                  {lang === 'hi' ? 'कुल अनुमानित खर्च' : lang === 'mr' ? 'एकूण अंदाजे खर्च' : 'Total Estimated Cost'}
                </span>
                <p className="text-[10px] text-muted-foreground">
                  {lang === 'hi' 
                    ? `उत्पाद: ₹${totalProductCost.toLocaleString('en-IN')} + मजदूरी: ₹${laborCost.toLocaleString('en-IN')}` 
                    : lang === 'mr'
                    ? `उत्पादन: ₹${totalProductCost.toLocaleString('en-IN')} + मजुरी: ₹${laborCost.toLocaleString('en-IN')}`
                    : `Products: ₹${totalProductCost.toLocaleString('en-IN')} + Labor: ₹${laborCost.toLocaleString('en-IN')}`}
                </p>
              </div>
            </div>
            <div className="text-right">
              <div className="flex items-center gap-1 text-primary font-bold text-lg">
                <span>₹{totalCost.toLocaleString('en-IN')}</span>
              </div>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}