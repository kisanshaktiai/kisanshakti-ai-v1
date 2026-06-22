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
  chemical_class?: string;
  regulatory_status?: 'approved' | 'restricted' | 'banned' | 'organic';
  organic_alternative?: string;
  dosage_reasoning?: string;
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
  // NEW: Actual labor breakdown from backend
  laborDays?: number;         // Total labor days calculated
  laborWorkers?: number;      // Number of workers
  laborDaysPerAcre?: number;  // Days per acre
  laborDailyWage?: number;    // Daily wage rate used
  laborDescription?: string;  // Description of labor work
}

// Product type translations for localization
const PRODUCT_TYPE_TRANSLATIONS: Record<string, Record<string, string>> = {
  organic: { en: 'Organic', hi: 'जैविक', mr: 'सेंद्रिय', pa: 'ਜੈਵਿਕ', ta: 'இயற்கை' },
  growth_promoter: { en: 'Growth Booster', hi: 'ग्रोथ बूस्टर', mr: 'वाढ वर्धक', pa: 'ਵਿਕਾਸ ਵਧਾਉਣ ਵਾਲਾ', ta: 'வளர்ச்சி ஊக்கி' },
  fertilizer: { en: 'Fertilizer', hi: 'खाद', mr: 'खत', pa: 'ਖਾਦ', ta: 'உரம்' },
  pesticide: { en: 'Pesticide', hi: 'कीटनाशक', mr: 'कीटकनाशक', pa: 'ਕੀਟਨਾਸ਼ਕ', ta: 'பூச்சிக்கொல்லி' },
  fungicide: { en: 'Fungicide', hi: 'फफूंदनाशक', mr: 'बुरशीनाशक', pa: 'ਉੱਲੀਨਾਸ਼ਕ', ta: 'பூஞ்சை எதிர்ப்பான்' },
  bio_fertilizer: { en: 'Bio-Fertilizer', hi: 'जैव खाद', mr: 'जैव खत', pa: 'ਜੈਵਿਕ ਖਾਦ', ta: 'உயிர் உரம்' },
  seed_treatment: { en: 'Seed Treatment', hi: 'बीज उपचार', mr: 'बीज प्रक्रिया', pa: 'ਬੀਜ ਇਲਾਜ', ta: 'விதை சிகிச்சை' },
};

// Common product name translations
const PRODUCT_NAME_TRANSLATIONS: Record<string, Record<string, string>> = {
  urea: { en: 'Urea', hi: 'यूरिया', mr: 'युरिया', pa: 'ਯੂਰੀਆ', ta: 'யூரியா' },
  dap: { en: 'DAP', hi: 'डीएपी', mr: 'डीएपी', pa: 'ਡੀਏਪੀ', ta: 'டிஏபி' },
  mop: { en: 'MOP', hi: 'एमओपी', mr: 'एमओपी', pa: 'ਐਮਓਪੀ', ta: 'எம்ஓபி' },
  fym: { en: 'Farm Yard Manure', hi: 'गोबर की खाद', mr: 'शेणखत', pa: 'ਗੋਬਰ ਖਾਦ', ta: 'தொழு உரம்' },
  vermicompost: { en: 'Vermicompost', hi: 'केंचुआ खाद', mr: 'गांडूळ खत', pa: 'ਕੇਂਚੂਆ ਖਾਦ', ta: 'மண்புழு உரம்' },
  neem_oil: { en: 'Neem Oil', hi: 'नीम का तेल', mr: 'कडुनिंबाचे तेल', pa: 'ਨਿੰਮ ਦਾ ਤੇਲ', ta: 'வேப்ப எண்ணெய்' },
  trichoderma: { en: 'Trichoderma', hi: 'ट्राइकोडर्मा', mr: 'ट्रायकोडर्मा', pa: 'ਟ੍ਰਾਈਕੋਡਰਮਾ', ta: 'டிரைக்கோடெர்மா' },
  pseudomonas: { en: 'Pseudomonas', hi: 'स्यूडोमोनास', mr: 'स्यूडोमोनास', pa: 'ਸੂਡੋਮੋਨਾਸ', ta: 'சூடோமோனாஸ்' },
  jeevamrut: { en: 'Jeevamrut', hi: 'जीवामृत', mr: 'जीवामृत', pa: 'ਜੀਵਾਮ੍ਰਿਤ', ta: 'ஜீவாம்ருதம்' },
  humic_acid: { en: 'Humic Acid', hi: 'ह्यूमिक एसिड', mr: 'ह्युमिक आम्ल', pa: 'ਹਿਊਮਿਕ ਐਸਿਡ', ta: 'ஹியூமிக் அமிலம்' },
  seaweed: { en: 'Seaweed Extract', hi: 'समुद्री शैवाल', mr: 'सीव्हीड अर्क', pa: 'ਸਮੁੰਦਰੀ ਸ਼ੈਵਾਲ', ta: 'கடல்பாசி சாறு' },
};

// APPLICATION METHOD TRANSLATIONS - Show correct method for each input type
const APPLICATION_METHOD_TRANSLATIONS: Record<string, Record<string, string>> = {
  // Seed treatment methods
  seed_coating: { en: 'Seed Coating (Dry)', hi: 'बीज लेप (सूखा)', mr: 'बियाणे लेपन (कोरडे)', pa: 'ਬੀਜ ਲੇਪ' },
  seed_inoculation: { en: 'Bio-Seed Treatment', hi: 'जैविक बीज उपचार', mr: 'जैविक बियाणे उपचार', pa: 'ਜੈਵਿਕ ਬੀਜ ਇਲਾਜ' },
  seed_treatment: { en: 'Seed Treatment', hi: 'बीज उपचार', mr: 'बियाणे प्रक्रिया', pa: 'ਬੀਜ ਉਪਚਾਰ' },
  
  // SOLID FERTILIZER methods - CANNOT be sprayed!
  broadcasting: { en: 'Broadcasting (Spread on soil)', hi: 'मिट्टी पर छिड़काव/बिखेरना', mr: 'मातीवर पसरवणे/विखुरणे', pa: 'ਮਿੱਟੀ ਤੇ ਖਿਲਾਰਨਾ' },
  top_dressing: { en: 'Top Dressing (Surface apply)', hi: 'ऊपरी खाद (सतह पर)', mr: 'वरून खत टाकणे', pa: 'ਉੱਪਰੀ ਖਾਦ' },
  basal_application: { en: 'Basal Application (Mix in soil)', hi: 'पायाभूत खाद (मिट्टी में मिलाएं)', mr: 'पायाभूत खत (मातीत मिसळा)', pa: 'ਮੁੱਢਲੀ ਖਾਦ' },
  soil_application: { en: 'Soil Application (Work into soil)', hi: 'मिट्टी में मिलाएं', mr: 'मातीत मिसळणे', pa: 'ਮਿੱਟੀ ਵਿੱਚ ਮਿਲਾਓ' },
  fertigation: { en: 'Fertigation (Through drip)', hi: 'ड्रिप द्वारा', mr: 'ठिबक द्वारे', pa: 'ਡ੍ਰਿਪ ਰਾਹੀਂ' },
  
  // LIQUID spray methods
  foliar_spray: { en: 'Foliar Spray (On leaves)', hi: 'पत्तों पर छिड़काव', mr: 'पानांवर फवारणी', pa: 'ਪੱਤਿਆਂ ਤੇ ਛਿੜਕਾਅ' },
  spray: { en: 'Spray', hi: 'छिड़काव', mr: 'फवारणी', pa: 'ਛਿੜਕਾਅ' },
  directed_spray: { en: 'Directed Spray (On target)', hi: 'निर्देशित छिड़काव', mr: 'थेट फवारणी', pa: 'ਨਿਰਦੇਸ਼ਿਤ ਛਿੜਕਾਅ' },
  pre_emergence_spray: { en: 'Pre-emergence Spray', hi: 'बुवाई पूर्व छिड़काव', mr: 'पेरणीपूर्व फवारणी', pa: 'ਬਿਜਾਈ ਤੋਂ ਪਹਿਲਾਂ ਛਿੜਕਾਅ' },
  post_emergence_spray: { en: 'Post-emergence Spray', hi: 'बुवाई पश्चात छिड़काव', mr: 'पेरणीनंतर फवारणी', pa: 'ਬਿਜਾਈ ਤੋਂ ਬਾਅਦ ਛਿੜਕਾਅ' },
  
  // Drench/irrigation methods
  drenching: { en: 'Soil Drenching (Pour at roots)', hi: 'जड़ों में डालें', mr: 'आळवणी (मुळ्यांजवळ)', pa: 'ਜੜ੍ਹਾਂ ਵਿੱਚ ਪਾਓ' },
  soil_drenching: { en: 'Root Zone Drench', hi: 'जड़ क्षेत्र में डालें', mr: 'मुळ्यांजवळ आळवणी', pa: 'ਜੜ੍ਹ ਖੇਤਰ ਵਿੱਚ ਪਾਓ' },
  irrigation: { en: 'With Irrigation Water', hi: 'सिंचाई जल के साथ', mr: 'पाण्यासोबत', pa: 'ਸਿੰਚਾਈ ਪਾਣੀ ਨਾਲ' },
  
  // Other methods
  dusting: { en: 'Dusting (Powder form)', hi: 'धूल छिड़काव (पाउडर)', mr: 'धुरळणी (पावडर)', pa: 'ਧੂੜ ਛਿੜਕਾਅ' },
  trap_installation: { en: 'Trap Installation', hi: 'जाल लगाएं', mr: 'सापळे लावणे', pa: 'ਜਾਲ ਲਗਾਓ' },
};

// PRODUCT FORM VALIDATION - Prevent wrong method display
const SOLID_PRODUCTS = ['urea', 'dap', 'mop', 'npk', 'ssp', 'potash', 'fym', 'vermicompost', 'compost', 
  'गांडूळ', 'शेणखत', 'गोबर', 'युरिया', 'यूरिया', 'डीएपी', 'एमओपी', 'केंचुआ', 'खाद', 'lime', 'gypsum'];
const SPRAY_METHODS = ['foliar_spray', 'spray', 'directed_spray', 'pre_emergence_spray', 'post_emergence_spray'];

// Validate and fix application method based on product name
function validateApplicationMethod(productName: string, method: string): string {
  const nameLower = (productName || '').toLowerCase();
  
  // If it's a solid product but method says spray - FIX IT!
  for (const solidProduct of SOLID_PRODUCTS) {
    if (nameLower.includes(solidProduct)) {
      if (SPRAY_METHODS.includes(method)) {
        // Wrong! Solid products cannot be sprayed
        console.warn(`⚠️ Fixed wrong method for ${productName}: ${method} → broadcasting/soil_application`);
        
        // Determine correct method
        if (nameLower.includes('fym') || nameLower.includes('शेणखत') || nameLower.includes('गोबर') || 
            nameLower.includes('vermicompost') || nameLower.includes('गांडूळ') || nameLower.includes('केंचुआ')) {
          return 'basal_application';
        }
        if (nameLower.includes('urea') || nameLower.includes('युरिया') || nameLower.includes('यूरिया')) {
          return 'top_dressing';
        }
        if (nameLower.includes('dap') || nameLower.includes('डीएपी') || 
            nameLower.includes('mop') || nameLower.includes('एमओपी') ||
            nameLower.includes('ssp') || nameLower.includes('npk')) {
          return 'basal_application';
        }
        return 'broadcasting';
      }
    }
  }
  
  return method;
}

// Translate application method to local language
function translateApplicationMethod(method: string, lang: string, productName?: string): string {
  if (!method) return '';
  
  // First validate the method against product name
  const validatedMethod = productName ? validateApplicationMethod(productName, method) : method;
  
  const methodLower = validatedMethod.toLowerCase().replace(/\s+/g, '_');
  
  // Direct match
  if (APPLICATION_METHOD_TRANSLATIONS[methodLower]) {
    return APPLICATION_METHOD_TRANSLATIONS[methodLower][lang] || APPLICATION_METHOD_TRANSLATIONS[methodLower].en || validatedMethod;
  }
  
  // Partial match
  for (const [key, translations] of Object.entries(APPLICATION_METHOD_TRANSLATIONS)) {
    if (methodLower.includes(key) || key.includes(methodLower)) {
      return translations[lang] || translations.en || validatedMethod;
    }
  }
  
  return validatedMethod;
}

// Translate product name to local language
function translateProductName(name: string, lang: string): string {
  if (!name) return '';
  
  const nameLower = name.toLowerCase().replace(/\s+/g, '_');
  
  // Check if it's a known product
  for (const [key, translations] of Object.entries(PRODUCT_NAME_TRANSLATIONS)) {
    if (nameLower.includes(key) || key.includes(nameLower.split('_')[0])) {
      return translations[lang] || translations.en || name;
    }
  }
  
  return name;
}

const productTypeConfig: Record<string, {
  icon: typeof Leaf;
  color: string;
  bgColor: string;
  borderColor: string;
  gradient: string;
  label: Record<string, string>;
}> = {
  organic: {
    icon: Leaf,
    color: 'text-success',
    bgColor: 'bg-success/10',
    borderColor: 'border-success/30',
    gradient: 'from-success to-success',
    label: PRODUCT_TYPE_TRANSLATIONS.organic,
  },
  growth_promoter: {
    icon: Sparkles,
    color: 'text-info',
    bgColor: 'bg-info/10',
    borderColor: 'border-info/30',
    gradient: 'from-info to-info',
    label: PRODUCT_TYPE_TRANSLATIONS.growth_promoter,
  },
  fertilizer: {
    icon: FlaskConical,
    color: 'text-warning',
    bgColor: 'bg-warning/10',
    borderColor: 'border-warning/30',
    gradient: 'from-warning to-warning',
    label: PRODUCT_TYPE_TRANSLATIONS.fertilizer,
  },
  pesticide: {
    icon: Bug,
    color: 'text-destructive',
    bgColor: 'bg-destructive/10',
    borderColor: 'border-destructive/30',
    gradient: 'from-destructive to-warning',
    label: PRODUCT_TYPE_TRANSLATIONS.pesticide,
  },
  fungicide: {
    icon: Shield,
    color: 'text-primary',
    bgColor: 'bg-primary/10',
    borderColor: 'border-primary/30',
    gradient: 'from-primary to-primary',
    label: PRODUCT_TYPE_TRANSLATIONS.fungicide,
  },
  bio_fertilizer: {
    icon: Leaf,
    color: 'text-success',
    bgColor: 'bg-success/10',
    borderColor: 'border-success/30',
    gradient: 'from-success to-success',
    label: PRODUCT_TYPE_TRANSLATIONS.bio_fertilizer,
  },
  seed_treatment: {
    icon: Sparkles,
    color: 'text-info',
    bgColor: 'bg-info/10',
    borderColor: 'border-info/30',
    gradient: 'from-info to-info',
    label: PRODUCT_TYPE_TRANSLATIONS.seed_treatment,
  },
};

export default function ProductRecommendationCard({ 
  products, 
  landAreaAcres = 1, 
  laborCost = 0,
  laborDays = 0,
  laborWorkers = 0,
  laborDaysPerAcre = 0,
  laborDailyWage = 350,
  laborDescription = ''
}: ProductRecommendationCardProps) {
  const { currentLanguage } = useLanguageStore();
  const lang = currentLanguage || 'en';

  // Show card if either products or labor cost exists
  const hasProducts = products && products.length > 0;
  const hasLaborCost = laborCost > 0;
  
  if (!hasProducts && !hasLaborCost) return null;

  const getLabel = (labels: Record<string, string>) => labels[lang] || labels.en;
  
  // Translate product name if it's in English but user language is different
  const getLocalizedProductName = (name: string) => {
    if (lang === 'en') return name;
    return translateProductName(name, lang);
  };

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
                      <h5 className="font-semibold text-sm leading-tight">{getLocalizedProductName(product.product_name)}</h5>
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

                {/* Active Ingredient with Chemical Details */}
                {product.active_ingredient && (
                  <div className="space-y-2 p-2.5 rounded-lg bg-muted/30 border border-border/50">
                    <div className="flex items-start gap-2 text-xs">
                      <FlaskConical className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
                      <span className="text-muted-foreground">
                        <span className="font-medium text-foreground">
                          {lang === 'hi' ? 'सक्रिय तत्व:' : lang === 'mr' ? 'सक्रिय घटक:' : 'Active:'}
                        </span>{' '}
                        {product.active_ingredient}
                      </span>
                    </div>
                    
                    {/* Chemical Class & Regulatory Status */}
                    <div className="flex flex-wrap gap-1.5">
                      {product.chemical_class && (
                        <Badge variant="outline" className="text-[9px] px-1.5 py-0 bg-info/10 border-info/30 text-info dark:text-info">
                          {product.chemical_class}
                        </Badge>
                      )}
                      {product.regulatory_status && (
                        <Badge 
                          variant="outline" 
                          className={cn(
                            "text-[9px] px-1.5 py-0",
                            product.regulatory_status === 'approved' && "bg-success/10 border-success/30 text-success dark:text-success",
                            product.regulatory_status === 'restricted' && "bg-warning/10 border-warning/30 text-warning dark:text-warning",
                            product.regulatory_status === 'banned' && "bg-destructive/10 border-destructive/30 text-destructive dark:text-destructive",
                            product.regulatory_status === 'organic' && "bg-success/10 border-success/30 text-success dark:text-success"
                          )}
                        >
                          {product.regulatory_status === 'approved' && '✅ '}
                          {product.regulatory_status === 'restricted' && '⚠️ '}
                          {product.regulatory_status === 'banned' && '🚫 '}
                          {product.regulatory_status === 'organic' && '🌿 '}
                          {product.regulatory_status.charAt(0).toUpperCase() + product.regulatory_status.slice(1)}
                        </Badge>
                      )}
                    </div>
                    
                    {/* Dosage Reasoning */}
                    {product.dosage_reasoning && (
                      <p className="text-[10px] text-muted-foreground italic leading-relaxed">
                        💡 {product.dosage_reasoning}
                      </p>
                    )}
                  </div>
                )}

                {/* Organic Alternative */}
                {product.organic_alternative && (
                  <div className="flex items-start gap-2 p-2 rounded-lg bg-success/10 border border-success/20">
                    <Leaf className="h-3.5 w-3.5 text-success shrink-0 mt-0.5" />
                    <span className="text-xs text-success dark:text-success">
                      <span className="font-medium">
                        {lang === 'hi' ? 'जैविक विकल्प:' : lang === 'mr' ? 'सेंद्रिय पर्याय:' : 'Organic alternative:'}
                      </span>{' '}
                      {product.organic_alternative}
                    </span>
                  </div>
                )}

                {/* Dose */}
                {product.dose_per_acre && (
                  <div className="flex items-start gap-2 text-xs">
                    <Droplets className="h-3.5 w-3.5 text-info shrink-0 mt-0.5" />
                    <span className="text-muted-foreground">
                      <span className="font-medium text-foreground">
                        {lang === 'hi' ? 'मात्रा:' : lang === 'mr' ? 'डोस:' : 'Dose:'}
                      </span>{' '}
                      {product.dose_per_acre}
                      {landAreaAcres > 1 && ` × ${landAreaAcres} = ${parseFloat(product.dose_per_acre) * landAreaAcres || product.dose_per_acre}`}
                    </span>
                  </div>
                )}

                {/* Application Method - TRANSLATED */}
                {product.application_method && (
                  <div className="flex items-start gap-2 text-xs">
                    <Sparkles className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
                    <span className="text-muted-foreground">
                      <span className="font-medium text-foreground">
                        {lang === 'hi' ? 'तरीका:' : lang === 'mr' ? 'पद्धत:' : 'Method:'}
                      </span>{' '}
                      {translateApplicationMethod(product.application_method, lang, product.product_name)}
                    </span>
                  </div>
                )}

                {/* Timing */}
                {product.timing && (
                  <div className="flex items-start gap-2 text-xs">
                    <Clock className="h-3.5 w-3.5 text-warning shrink-0 mt-0.5" />
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
                    <CloudRain className="h-3.5 w-3.5 text-info shrink-0 mt-0.5" />
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
                  <div className="flex items-start gap-2 p-2 rounded-lg bg-warning/10 border border-warning/20">
                    <Shield className="h-3.5 w-3.5 text-warning shrink-0 mt-0.5" />
                    <span className="text-xs text-warning dark:text-warning">
                      {product.precautions}
                    </span>
                  </div>
                )}

                {/* PHI Days Warning for Pesticides */}
                {product.product_type === 'pesticide' && product.phi_days && (
                  <div className="flex items-start gap-2 p-2 rounded-lg bg-destructive/10 border border-destructive/20">
                    <AlertTriangle className="h-3.5 w-3.5 text-destructive shrink-0 mt-0.5" />
                    <span className="text-xs text-destructive dark:text-destructive">
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

      {/* Labor Cost Section - Enhanced with ACTUAL breakdown */}
      {laborCost > 0 && (
        <Card className="border-2 border-primary/30 bg-primary/5">
          <div className="p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-gradient-to-br from-primary to-primary text-white shadow-md">
                  <Users className="h-4 w-4" />
                </div>
                <div>
                  <span className="text-sm font-medium">
                    {lang === 'hi' ? 'मजदूरी खर्च' : lang === 'mr' ? 'मजुरी खर्च' : 'Labor Cost'}
                  </span>
                  <p className="text-[10px] text-muted-foreground">
                    {laborDescription || (lang === 'hi' ? 'MGNREGA दर आधारित' : lang === 'mr' ? 'MGNREGA दर आधारित' : 'Based on MGNREGA rates')}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <div className="flex items-center gap-1 text-primary font-bold">
                  <IndianRupee className="h-3.5 w-3.5" />
                  <span>₹{laborCost.toLocaleString('en-IN')}</span>
                </div>
              </div>
            </div>
            
            {/* FIXED: Display REALISTIC labor breakdown - Worker × Days model */}
            <div className="text-[10px] text-muted-foreground bg-primary/5 p-2 rounded-lg space-y-1">
              {laborDays > 0 && laborWorkers > 0 ? (
                <>
                  <div className="font-medium text-primary dark:text-primary">
                    {lang === 'hi' 
                      ? `${laborWorkers} मजदूर × ${laborDaysPerAcre || 1} दिन = ${laborDays.toFixed(1)} मजदूर-दिवस` 
                      : lang === 'mr'
                      ? `${laborWorkers} मजूर × ${laborDaysPerAcre || 1} दिवस = ${laborDays.toFixed(1)} मजूर-दिवस`
                      : `${laborWorkers} workers × ${laborDaysPerAcre || 1} days = ${laborDays.toFixed(1)} labor-days`}
                  </div>
                  <div>
                    {lang === 'hi' 
                      ? `${laborDays.toFixed(1)} मजदूर-दिवस @ ₹${laborDailyWage}/दिन = ₹${laborCost.toLocaleString('en-IN')}` 
                      : lang === 'mr'
                      ? `${laborDays.toFixed(1)} मजूर-दिवस @ ₹${laborDailyWage}/दिवस = ₹${laborCost.toLocaleString('en-IN')}`
                      : `${laborDays.toFixed(1)} labor-days @ ₹${laborDailyWage}/day = ₹${laborCost.toLocaleString('en-IN')}`}
                  </div>
                </>
              ) : (
                // Fallback: Only if no actual data available
                <div>
                  {lang === 'hi' 
                    ? `अनुमानित मजदूरी @ ₹${laborDailyWage}/दिन` 
                    : lang === 'mr'
                    ? `अंदाजे मजुरी @ ₹${laborDailyWage}/दिवस`
                    : `Estimated labor @ ₹${laborDailyWage}/day`}
                </div>
              )}
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