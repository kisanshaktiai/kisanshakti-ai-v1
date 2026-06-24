/**
 * Cross-platform haptic feedback. Uses the Web Vibration API where available
 * (which works on Android Chrome, Capacitor Android, and many PWAs). Silent
 * no-op on unsupported platforms (iOS Safari, desktop).
 *
 * Kept dependency-free intentionally — adding @capacitor/haptics later just
 * means swapping the impl here, no caller changes required.
 */
type HapticStyle = 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error';

const DURATION_MAP: Record<HapticStyle, number | number[]> = {
  light: 8,
  medium: 16,
  heavy: 28,
  success: [10, 40, 10],
  warning: [18, 30, 18],
  error: [25, 50, 25],
};

export function hapticFeedback(style: HapticStyle = 'light'): void {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(DURATION_MAP[style]);
    }
  } catch {
    // Silent — haptics are best-effort.
  }
}
