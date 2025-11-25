import React, { useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTextToSpeech } from '@/hooks/useTextToSpeech';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

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
  const { speak, stop, isSpeaking } = useTextToSpeech();
  const { t, i18n } = useTranslation();
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

  const handleToggleSpeech = () => {
    if (isSpeaking) {
      stop();
    } else {
      const summary = generateWeatherSummary();
      speak(summary);
      setHasSpoken(true);
    }
  };

  return (
    <motion.div
      initial={{ scale: 0.9, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      className={cn("relative", className)}
    >
      <Button
        onClick={handleToggleSpeech}
        size="lg"
        variant={isSpeaking ? "default" : "secondary"}
        className={cn(
          "relative gap-2 min-w-[160px] shadow-lg transition-all duration-300",
          isSpeaking && "animate-pulse bg-primary text-primary-foreground"
        )}
      >
        {isSpeaking ? (
          <>
            <VolumeX className="h-5 w-5" />
            <span className="font-semibold">{t('weather.voice.stop', 'Stop Reading')}</span>
          </>
        ) : (
          <>
            <Volume2 className={cn("h-5 w-5", hasSpoken && "text-primary")} />
            <span className="font-semibold">{t('weather.voice.read', 'Read Aloud')}</span>
          </>
        )}
      </Button>

      {isSpeaking && (
        <motion.div
          className="absolute -inset-1 bg-primary/20 rounded-lg -z-10"
          animate={{
            scale: [1, 1.1, 1],
            opacity: [0.5, 0.8, 0.5]
          }}
          transition={{
            duration: 1.5,
            repeat: Infinity,
            ease: "easeInOut"
          }}
        />
      )}
    </motion.div>
  );
};
