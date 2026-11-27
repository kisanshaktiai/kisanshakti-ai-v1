import React, { useState } from 'react';
import { Volume2, VolumeX, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
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

  const label = isSpeaking ? t('weather.voice.stop', 'Stop Reading') : t('weather.voice.read', 'Read Aloud');

  return (
    <button
      type="button"
      onClick={handleToggleSpeech}
      disabled={isLoading}
      aria-pressed={isSpeaking}
      className={cn(
        'lf-lab flex items-center justify-center gap-2 rounded-full px-4 font-bold',
        isLoading && 'opacity-70 cursor-wait',
        isSpeaking ? 'bg-primary text-primary-foreground' : 'bg-primary/10 text-primary',
        className
      )}
      style={{ minHeight: 'var(--lf-tap)' }}
    >
      {isLoading ? (
        <Loader2 className="h-6 w-6 animate-spin" aria-hidden />
      ) : isSpeaking ? (
        <VolumeX className="h-6 w-6" aria-hidden />
      ) : (
        <Volume2 className="h-6 w-6" aria-hidden />
      )}
      <span className="min-w-0 truncate">{label}</span>
    </button>
  );
};
