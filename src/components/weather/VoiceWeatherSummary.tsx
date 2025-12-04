import React, { useState } from 'react';
import { Volume2, VolumeX, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { nativeTTSService } from '@/services/nativeTTSService';
import { toast } from 'sonner';

interface VoiceWeatherSummaryProps {
  currentWeather: any;
  forecast: any[];
  className?: string;
}

export const VoiceWeatherSummary: React.FC<VoiceWeatherSummaryProps> = ({
  currentWeather,
  forecast,
  className
}) => {
  const { t, i18n } = useTranslation();
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [hasSpoken, setHasSpoken] = useState(false);

  const generateWeatherSummary = () => {
    if (!currentWeather) return '';

    const temp = Math.round(currentWeather.temp);
    const feelsLike = Math.round(currentWeather.feels_like);
    const condition = currentWeather.description || 'clear';
    const humidity = currentWeather.humidity;
    const windSpeed = Math.round(currentWeather.wind_speed * 3.6);
    
    // Get today's forecast for rain probability
    const rainChance = forecast[0]?.pop ? Math.round(forecast[0].pop * 100) : 0;
    
    // Generate farming recommendations
    let farmingAdvice = '';
    if (rainChance > 60) {
      farmingAdvice = t('weather.voice.highRainAdvice', 'Avoid spraying today due to high rain probability.');
    } else if (windSpeed > 20) {
      farmingAdvice = t('weather.voice.highWindAdvice', 'Be careful with spraying due to strong winds.');
    } else if (humidity < 40 && temp > 30) {
      farmingAdvice = t('weather.voice.irrigationAdvice', 'Consider increasing irrigation due to hot and dry conditions.');
    } else {
      farmingAdvice = t('weather.voice.goodConditions', 'Weather conditions are favorable for farming activities.');
    }

    // Create multilingual summary
    const summary = t('weather.voice.summary', {
      defaultValue: "Today's weather: {{temp}} degrees celsius, {{condition}}. It feels like {{feelsLike}} degrees. Humidity is {{humidity}} percent. Wind speed is {{windSpeed}} kilometers per hour. {{rainInfo}} {{advice}}",
      temp,
      condition,
      feelsLike,
      humidity,
      windSpeed,
      rainInfo: rainChance > 20 ? `Rain probability is ${rainChance} percent.` : 'No rain expected.',
      advice: farmingAdvice
    });

    return summary;
  };

  const handleToggleSpeech = async () => {
    if (isSpeaking) {
      nativeTTSService.stop();
      setIsSpeaking(false);
    } else {
      const summary = generateWeatherSummary();
      if (!summary) return;

      setIsLoading(true);
      
      try {
        const result = await nativeTTSService.speak(
          summary,
          i18n.language || 'hi',
          { rate: 1.0, pitch: 1.0, volume: 1.0 },
          {
            onStart: () => {
              setIsSpeaking(true);
              setIsLoading(false);
            },
            onEnd: () => {
              setIsSpeaking(false);
            },
            onError: (err) => {
              setIsSpeaking(false);
              setIsLoading(false);
              toast.error(t('weather.voice.error', 'Failed to read weather'));
            }
          }
        );

        if (result.success) {
          setHasSpoken(true);
          console.log(`[WeatherTTS] Provider: ${result.provider}, Language: ${result.usedLanguage}`);
        } else {
          setIsLoading(false);
          toast.error(result.error || 'TTS failed');
        }
      } catch (err) {
        setIsLoading(false);
        setIsSpeaking(false);
      }
    }
  };

  return (
    <motion.button
      initial={{ scale: 0.9, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      onClick={handleToggleSpeech}
      disabled={isLoading}
      className={cn(
        "relative p-3 rounded-full transition-all duration-300 shadow-lg backdrop-blur-sm",
        isLoading && "opacity-70 cursor-wait",
        isSpeaking 
          ? "bg-primary text-primary-foreground animate-pulse" 
          : "bg-background/80 hover:bg-background border border-border",
        className
      )}
      title={isSpeaking ? t('weather.voice.stop', 'Stop Reading') : t('weather.voice.read', 'Read Aloud')}
    >
      {isLoading ? (
        <Loader2 className="h-5 w-5 animate-spin" />
      ) : isSpeaking ? (
        <VolumeX className="h-5 w-5" />
      ) : (
        <Volume2 className={cn("h-5 w-5", hasSpoken && "text-primary")} />
      )}

      {isSpeaking && (
        <motion.div
          className="absolute -inset-1 bg-primary/20 rounded-full -z-10"
          animate={{
            scale: [1, 1.2, 1],
            opacity: [0.5, 0.8, 0.5]
          }}
          transition={{
            duration: 1.5,
            repeat: Infinity,
            ease: "easeInOut"
          }}
        />
      )}
    </motion.button>
  );
};
