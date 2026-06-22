import React from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { 
  Sprout, TrendingUp, Calendar, Clock, 
  Droplet, IndianRupee, CheckCircle, AlertTriangle,
  RefreshCw, Camera, Leaf
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';

// ═══════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS (Inline - previously from deprecated crop-selection-rules)
// ═══════════════════════════════════════════════════════════════════════════

type CropGroup = 'CEREALS' | 'PULSES' | 'OILSEEDS' | 'SUGARCANE' | 'COTTON' | 'VEGETABLES' | 'FRUITS' | 'SPICES';

interface CropRecommendation {
  crop_code: string;
  crop_name: string;
  crop_name_mr: string;
  crop_name_hi: string;
  crop_group: CropGroup;
  suitability_score: number;
  sowing_window: { start_month: number; end_month: number; optimal_days: string; };
  expected_duration_days: number;
  estimated_yield_per_acre: string;
  estimated_cost_per_acre: number;
  estimated_revenue_per_acre: number;
  water_requirement: 'LOW' | 'MEDIUM' | 'HIGH';
  reasons: string[];
  warnings: string[];
  rotation_benefit: string;
  source_rules: string[];
}

interface CropSelectionResult {
  recommendations: CropRecommendation[];
  rotation_warnings: string[];
  soil_limitations: string[];
  confidence: number;
  rules_applied: string[];
}

// ═══════════════════════════════════════════════════════════════════════════
// COMPONENT TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════

interface CropRecommendationCardProps {
  result: CropSelectionResult;
  language: string;
  onTakeSoilPhoto?: () => void;
}

// ═══════════════════════════════════════════════════════════════════════════
// TRANSLATIONS
// ═══════════════════════════════════════════════════════════════════════════

const LABELS: Record<string, Record<string, string>> = {
  en: {
    cropRecommendation: '🌱 Crop Recommendation',
    suitability: 'Suitability',
    sowingWindow: 'Sowing Window',
    duration: 'Duration',
    yield: 'Expected Yield',
    cost: 'Estimated Cost',
    revenue: 'Estimated Revenue',
    waterNeed: 'Water Need',
    whyChoose: '✅ Why Choose',
    caution: '⚠️ Caution',
    otherOptions: '🔄 Other Options',
    takeSoilPhoto: '📷 Take Soil Photo for Better Accuracy',
    confidence: 'Confidence',
    rulesApplied: 'rules applied',
    days: 'days',
    perAcre: '/acre'
  },
  hi: {
    cropRecommendation: '🌱 फसल सिफारिश',
    suitability: 'अनुकूलता',
    sowingWindow: 'बुवाई अवधि',
    duration: 'अवधि',
    yield: 'अपेक्षित उपज',
    cost: 'अनुमानित लागत',
    revenue: 'अनुमानित आय',
    waterNeed: 'पानी की जरूरत',
    whyChoose: '✅ क्यों चुनें',
    caution: '⚠️ सावधानी',
    otherOptions: '🔄 अन्य विकल्प',
    takeSoilPhoto: '📷 बेहतर सटीकता के लिए मिट्टी की फोटो लें',
    confidence: 'विश्वसनीयता',
    rulesApplied: 'नियम लागू',
    days: 'दिन',
    perAcre: '/एकड़'
  },
  mr: {
    cropRecommendation: '🌱 पीक शिफारस',
    suitability: 'अनुकूलता',
    sowingWindow: 'पेरणी कालावधी',
    duration: 'कालावधी',
    yield: 'अपेक्षित उत्पादन',
    cost: 'अंदाजे खर्च',
    revenue: 'अंदाजे उत्पन्न',
    waterNeed: 'पाण्याची गरज',
    whyChoose: '✅ का निवडावे',
    caution: '⚠️ काळजी घ्या',
    otherOptions: '🔄 इतर पर्याय',
    takeSoilPhoto: '📷 अधिक अचूकतेसाठी मातीचा फोटो घ्या',
    confidence: 'विश्वासार्हता',
    rulesApplied: 'नियम लागू',
    days: 'दिवस',
    perAcre: '/एकर'
  }
};

const getLabels = (lang: string) => LABELS[lang] || LABELS.en;

// ═══════════════════════════════════════════════════════════════════════════
// SINGLE CROP CARD
// ═══════════════════════════════════════════════════════════════════════════

interface SingleCropCardProps {
  crop: CropRecommendation;
  language: string;
  isPrimary?: boolean;
}

function SingleCropCard({ crop, language, isPrimary = false }: SingleCropCardProps) {
  const labels = getLabels(language);
  
  const getCropName = () => {
    if (language === 'mr') return crop.crop_name_mr;
    if (language === 'hi') return crop.crop_name_hi;
    return crop.crop_name;
  };
  
  const getWaterNeedColor = (need: string) => {
    switch (need) {
      case 'LOW': return 'text-success bg-success-soft';
      case 'MEDIUM': return 'text-warning bg-warning-soft';
      case 'HIGH': return 'text-info bg-info-soft';
      default: return 'text-muted-foreground bg-muted';
    }
  };
  
  const getSuitabilityColor = (score: number) => {
    if (score >= 70) return 'text-success';
    if (score >= 50) return 'text-warning';
    return 'text-destructive';
  };
  
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "rounded-xl p-4 border",
        isPrimary 
          ? "bg-gradient-to-br from-success/10 via-success/5 to-transparent border-success/30" 
          : "bg-card/50 border-border/30"
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className={cn(
            "p-2 rounded-lg shrink-0",
            isPrimary ? "bg-success/20" : "bg-primary/10"
          )}>
            <Sprout className={cn(
              "h-5 w-5",
              isPrimary ? "text-success" : "text-primary"
            )} />
          </div>
          <div>
            <h3 className="font-semibold text-foreground">{getCropName()}</h3>
            <Badge variant="outline" className="text-xs mt-1">
              {crop.crop_group}
            </Badge>
          </div>
        </div>
        <div className="text-right">
          <span className={cn("text-2xl font-bold", getSuitabilityColor(crop.suitability_score))}>
            {crop.suitability_score}%
          </span>
          <p className="text-xs text-muted-foreground">{labels.suitability}</p>
        </div>
      </div>
      
      {/* Suitability Progress */}
      <Progress 
        value={crop.suitability_score} 
        className="h-2 mb-4"
      />
      
      {/* Info Grid */}
      <div className="grid grid-cols-2 gap-2 text-sm mb-3">
        {/* Sowing Window */}
        <div className="flex items-center gap-2 bg-background/50 rounded-lg p-2">
          <Calendar className="h-4 w-4 text-primary shrink-0" />
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">{labels.sowingWindow}</p>
            <p className="font-medium truncate">{crop.sowing_window.optimal_days}</p>
          </div>
        </div>
        
        {/* Duration */}
        <div className="flex items-center gap-2 bg-background/50 rounded-lg p-2">
          <Clock className="h-4 w-4 text-warning shrink-0" />
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">{labels.duration}</p>
            <p className="font-medium">{crop.expected_duration_days} {labels.days}</p>
          </div>
        </div>
        
        {/* Expected Yield */}
        <div className="flex items-center gap-2 bg-background/50 rounded-lg p-2">
          <TrendingUp className="h-4 w-4 text-success shrink-0" />
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">{labels.yield}</p>
            <p className="font-medium truncate">{crop.estimated_yield_per_acre}</p>
          </div>
        </div>
        
        {/* Water Need */}
        <div className="flex items-center gap-2 bg-background/50 rounded-lg p-2">
          <Droplet className="h-4 w-4 text-info shrink-0" />
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">{labels.waterNeed}</p>
            <Badge variant="secondary" className={cn("text-xs", getWaterNeedColor(crop.water_requirement))}>
              {crop.water_requirement}
            </Badge>
          </div>
        </div>
        
        {/* Cost */}
        <div className="flex items-center gap-2 bg-background/50 rounded-lg p-2">
          <IndianRupee className="h-4 w-4 text-destructive shrink-0" />
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">{labels.cost}</p>
            <p className="font-medium">₹{crop.estimated_cost_per_acre.toLocaleString()}{labels.perAcre}</p>
          </div>
        </div>
        
        {/* Revenue */}
        <div className="flex items-center gap-2 bg-background/50 rounded-lg p-2">
          <TrendingUp className="h-4 w-4 text-success shrink-0" />
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">{labels.revenue}</p>
            <p className="font-medium text-success">₹{crop.estimated_revenue_per_acre.toLocaleString()}{labels.perAcre}</p>
          </div>
        </div>
      </div>
      
      {/* Reasons */}
      {crop.reasons.length > 0 && (
        <div className="mb-3">
          <p className="text-sm font-medium text-success mb-1">{labels.whyChoose}</p>
          <ul className="text-sm text-muted-foreground space-y-1">
            {crop.reasons.map((reason, idx) => (
              <li key={idx} className="flex items-start gap-2">
                <CheckCircle className="h-4 w-4 text-success shrink-0 mt-0.5" />
                <span>{reason}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      
      {/* Warnings */}
      {crop.warnings.length > 0 && (
        <div>
          <p className="text-sm font-medium text-warning mb-1">{labels.caution}</p>
          <ul className="text-sm text-muted-foreground space-y-1">
            {crop.warnings.map((warning, idx) => (
              <li key={idx} className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
                <span>{warning}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      
      {/* Rotation Benefit */}
      {crop.rotation_benefit && (
        <div className="mt-3 flex items-center gap-2 text-sm text-primary">
          <RefreshCw className="h-4 w-4" />
          <span>{crop.rotation_benefit}</span>
        </div>
      )}
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export function CropRecommendationCard({ result, language, onTakeSoilPhoto }: CropRecommendationCardProps) {
  const labels = getLabels(language);
  
  if (result.recommendations.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-muted/50 rounded-xl p-4 border border-border/30"
      >
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-warning/20">
            <AlertTriangle className="h-5 w-5 text-warning" />
          </div>
          <p className="text-sm text-muted-foreground">
            {language === 'mr'
              ? 'या हंगामात कोणतेही पीक शिफारस करता येत नाही। कृपया स्थानिक कृषी अधिकाऱ्यांशी संपर्क साधा।'
              : language === 'hi'
                ? 'इस मौसम में कोई फसल अनुशंसित नहीं है। कृपया स्थानीय कृषि अधिकारी से संपर्क करें।'
                : 'No crops recommended for this season. Please consult local agricultural officer.'}
          </p>
        </div>
      </motion.div>
    );
  }
  
  const primaryCrop = result.recommendations[0];
  const otherCrops = result.recommendations.slice(1, 3);
  
  return (
    <div className="w-full space-y-4 p-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-lg bg-gradient-to-br from-success/20 to-success/10">
            <Leaf className="h-5 w-5 text-success" />
          </div>
          <h3 className="font-semibold text-foreground">{labels.cropRecommendation}</h3>
        </div>
        <Badge variant="secondary" className="text-xs">
          {labels.confidence}: {result.confidence}%
        </Badge>
      </div>
      
      {/* Primary Recommendation */}
      <SingleCropCard crop={primaryCrop} language={language} isPrimary={true} />
      
      {/* Take Soil Photo Button */}
      {onTakeSoilPhoto && (
        <Button
          variant="outline"
          className="w-full gap-2 border-primary/30 hover:bg-primary/10"
          onClick={onTakeSoilPhoto}
        >
          <Camera className="h-4 w-4" />
          {labels.takeSoilPhoto}
        </Button>
      )}
      
      {/* Other Options */}
      {otherCrops.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <RefreshCw className="h-4 w-4" />
            {labels.otherOptions}
          </h4>
          {otherCrops.map((crop, idx) => (
            <SingleCropCard key={idx} crop={crop} language={language} isPrimary={false} />
          ))}
        </div>
      )}
      
      {/* Rotation Warnings */}
      {result.rotation_warnings.length > 0 && (
        <div className="bg-warning/10 rounded-lg p-3 border border-warning/30">
          <p className="text-sm font-medium text-warning mb-2">⚠️ Rotation Warnings</p>
          <ul className="text-sm text-muted-foreground space-y-1">
            {result.rotation_warnings.map((warning, idx) => (
              <li key={idx}>• {warning}</li>
            ))}
          </ul>
        </div>
      )}
      
      {/* Rules Applied Footer */}
      <div className="text-xs text-muted-foreground text-center">
        🧠 Decision Brain • {result.rules_applied.length} {labels.rulesApplied}
      </div>
    </div>
  );
}
