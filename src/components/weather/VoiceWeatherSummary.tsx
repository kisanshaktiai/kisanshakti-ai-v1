import React, { useState } from 'react';
import { Volume2, VolumeX, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useSpeech } from '@/hooks/useSpeech';
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
  const [hasSpoken, setHasSpoken] = useState(false);
  const { speak, stop, isSpeaking, isLoading } = useSpeech({ language: i18n.language || 'hi' });

  const generateWeatherSummary = () => {
    if (!currentWeather) return '';
    const temp = Math.round(currentWeather.temp);
    const feelsLike = Math.round(currentWeather.feels_like);
    const condition = currentWeather.description || 'clear';
    const humidity = currentWeather.humidity;
    const windSpeed = Math.round(currentWeather.wind_speed * 3.6);
    const rainChance = forecast[0]?.pop ? Math.round(forecast[0].pop * 100) : 0;

    let farmingAdvice = '';
    if (rainChance > 60) farmingAdvice = t('weather.voice.high_rain_advice');
    else if (windSpeed > 20) farmingAdvice = t('weather.voice.high_wind_advice');
    else if (humidity < 40 && temp > 30) farmingAdvice = t('weather.voice.irrigation_advice');
    else farmingAdvice = t('weather.voice.good_conditions');

    return t('weather.voice.summary', {
      temp,
      condition,
      feelsLike,
      humidity,
      windSpeed,
      rainInfo: rainChance > 20
        ? t('weather.voice.rain_expected', { chance: rainChance })
        : t('weather.voice.no_rain'),
      advice: farmingAdvice
    });
  };

  const handleToggleSpeech = async () => {
    if (isSpeaking) {
      stop();
      return;
    }

    const summary = generateWeatherSummary();
    if (!summary) return;

    try {
      const result = await speak(summary, i18n.language || 'hi');
      if (result.success) {
        setHasSpoken(true);
      } else if (!result.voiceUnavailable) {
        toast.error(result.error || t('weather.voice.error', 'Failed to read weather'));
      }
    } catch {
      toast.error(t('weather.voice.error', 'Failed to read weather'));
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
        'relative p-3 rounded-full transition-all duration-300 shadow-lg backdrop-blur-sm',
        isLoading && 'opacity-70 cursor-wait',
        isSpeaking
          ? 'bg-primary text-primary-foreground animate-pulse'
          : 'bg-background/80 hover:bg-background border border-border',
        className
      )}
      title={isSpeaking ? t('weather.voice.stop', 'Stop Reading') : t('weather.voice.read', 'Read Aloud')}
    >
      {isLoading ? (
        <Loader2 className="h-5 w-5 animate-spin" />
      ) : isSpeaking ? (
        <VolumeX className="h-5 w-5" />
      ) : (
        <Volume2 className={cn('h-5 w-5', hasSpoken && 'text-primary')} />
      )}
      {isSpeaking && (
        <motion.div
          className="absolute -inset-1 bg-primary/20 rounded-full -z-10"
          animate={{ scale: [1, 1.2, 1], opacity: [0.5, 0.8, 0.5] }}
          transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
        />
      )}
    </motion.button>
  );
};
