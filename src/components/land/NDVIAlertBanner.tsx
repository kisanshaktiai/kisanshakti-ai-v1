import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { 
  AlertTriangle, 
  X, 
  Phone, 
  Droplets, 
  ChevronDown,
  ChevronUp,
  Volume2 
} from 'lucide-react';
import { useTextToSpeech } from '@/hooks/useTextToSpeech';

interface NDVIAlertBannerProps {
  alerts: string[];
  healthLabel: string;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  onDismiss?: () => void;
  className?: string;
}

export function NDVIAlertBanner({ 
  alerts, 
  healthLabel, 
  riskLevel, 
  onDismiss,
  className 
}: NDVIAlertBannerProps) {
  const { t, i18n } = useTranslation();
  const { speak, isSpeaking, stop } = useTextToSpeech({ language: i18n.language === 'hi' ? 'hi-IN' : 'en-US' });
  const [isExpanded, setIsExpanded] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);

  if (isDismissed || alerts.length === 0 || riskLevel === 'low') {
    return null;
  }

  const getBannerConfig = () => {
    switch (riskLevel) {
      case 'critical':
        return {
          bg: 'bg-gradient-to-r from-destructive via-destructive/90 to-destructive/80',
          text: 'text-destructive-foreground',
          icon: AlertTriangle,
          title: t('ndvi.banner.critical', '🚨 Critical Alert'),
        };
      case 'high':
        return {
          bg: 'bg-gradient-to-r from-orange-500 via-orange-500/90 to-orange-500/80',
          text: 'text-white',
          icon: AlertTriangle,
          title: t('ndvi.banner.high', '⚠️ High Priority Alert'),
        };
      default:
        return {
          bg: 'bg-gradient-to-r from-warning via-warning/90 to-warning/80',
          text: 'text-warning-foreground',
          icon: AlertTriangle,
          title: t('ndvi.banner.attention', '📢 Attention Required'),
        };
    }
  };

  const config = getBannerConfig();
  const BannerIcon = config.icon;

  const handleSpeak = () => {
    if (isSpeaking) {
      stop();
    } else {
      const message = `${config.title}. ${alerts.join('. ')}`;
      speak(message);
    }
  };

  const handleDismiss = () => {
    setIsDismissed(true);
    onDismiss?.();
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        className={cn(
          "relative overflow-hidden rounded-2xl shadow-lg",
          config.bg,
          config.text,
          className
        )}
      >
        {/* Animated background pattern */}
        {riskLevel === 'critical' && (
          <motion.div
            className="absolute inset-0 opacity-20"
            animate={{ backgroundPosition: ['0% 0%', '100% 100%'] }}
            transition={{ duration: 3, repeat: Infinity, repeatType: 'reverse' }}
            style={{
              backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 10px, rgba(255,255,255,0.1) 10px, rgba(255,255,255,0.1) 20px)',
              backgroundSize: '28px 28px',
            }}
          />
        )}

        <div className="relative p-4">
          <div className="flex items-start gap-3">
            {/* Icon */}
            <motion.div
              animate={riskLevel === 'critical' ? { scale: [1, 1.2, 1] } : {}}
              transition={{ duration: 1, repeat: Infinity }}
              className="p-2 rounded-full bg-white/20 flex-shrink-0"
            >
              <BannerIcon className="h-5 w-5" />
            </motion.div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1">
                <h4 className="font-bold text-base">{config.title}</h4>
                <div className="flex items-center gap-1">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-current hover:bg-white/20"
                    onClick={handleSpeak}
                  >
                    <Volume2 className={cn("h-4 w-4", isSpeaking && "animate-pulse")} />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-current hover:bg-white/20"
                    onClick={handleDismiss}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <p className="text-sm opacity-90 line-clamp-1">
                {alerts[0]}
                {alerts.length > 1 && ` (+${alerts.length - 1} more)`}
              </p>

              {/* Expandable alerts */}
              <AnimatePresence>
                {isExpanded && alerts.length > 1 && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="mt-2 space-y-1 overflow-hidden"
                  >
                    {alerts.slice(1).map((alert, index) => (
                      <p key={index} className="text-sm opacity-80">• {alert}</p>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Action buttons */}
              <div className="flex items-center gap-2 mt-3">
                <Button
                  size="sm"
                  variant="secondary"
                  className="bg-white/20 hover:bg-white/30 text-current border-none"
                  onClick={() => window.open('tel:1800-180-1551')}
                >
                  <Phone className="h-3.5 w-3.5 mr-1.5" />
                  {t('ndvi.banner.call_expert', 'Call Expert')}
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  className="bg-white/20 hover:bg-white/30 text-current border-none"
                >
                  <Droplets className="h-3.5 w-3.5 mr-1.5" />
                  {t('ndvi.banner.irrigate', 'Irrigate Now')}
                </Button>
                
                {alerts.length > 1 && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="ml-auto text-current hover:bg-white/20"
                    onClick={() => setIsExpanded(!isExpanded)}
                  >
                    {isExpanded ? (
                      <ChevronUp className="h-4 w-4" />
                    ) : (
                      <ChevronDown className="h-4 w-4" />
                    )}
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
