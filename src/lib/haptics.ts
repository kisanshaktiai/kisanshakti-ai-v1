/**
 * Cross-platform haptic feedback. No-op on web, native vibration on Capacitor.
 * Lazy-loaded so non-Capacitor builds don't pay the bundle cost.
 */
type HapticStyle = 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error';

let capacitorHapticsPromise: Promise<typeof import('@capacitor/haptics') | null> | null = null;

const loadCapacitor = () => {
  if (capacitorHapticsPromise) return capacitorHapticsPromise;
  capacitorHapticsPromise = import('@capacitor/haptics').catch(() => null);
  return capacitorHapticsPromise;
};

export async function hapticFeedback(style: HapticStyle = 'light'): Promise<void> {
  try {
    // Web fallback: short vibration if supported.
    if (typeof window !== 'undefined' && 'vibrate' in navigator) {
      const ms = style === 'heavy' || style === 'error' ? 30 : style === 'medium' || style === 'warning' ? 18 : 10;
      navigator.vibrate?.(ms);
    }

    const mod = await loadCapacitor();
    if (!mod) return;
    const { Haptics, ImpactStyle, NotificationType } = mod;

    if (style === 'success' || style === 'warning' || style === 'error') {
      const map = {
        success: NotificationType.Success,
        warning: NotificationType.Warning,
        error: NotificationType.Error,
      } as const;
      await Haptics.notification({ type: map[style] });
      return;
    }

    const impactMap = {
      light: ImpactStyle.Light,
      medium: ImpactStyle.Medium,
      heavy: ImpactStyle.Heavy,
    } as const;
    await Haptics.impact({ style: impactMap[style] });
  } catch {
    // Silent — haptics are best-effort.
  }
}
