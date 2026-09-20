import { useEffect, useState } from 'react';

export interface ChartTheme {
  chart1: string;
  chart2: string;
  chart3: string;
  chart4: string;
  chart5: string;
  foreground: string;
  mutedForeground: string;
  border: string;
  card: string;
  destructive: string;
}

const tokenNames = {
  chart1: '--chart-1',
  chart2: '--chart-2',
  chart3: '--chart-3',
  chart4: '--chart-4',
  chart5: '--chart-5',
  foreground: '--foreground',
  mutedForeground: '--muted-foreground',
  border: '--border',
  card: '--card',
  destructive: '--destructive',
} as const;

function readTheme(): ChartTheme {
  const styles = getComputedStyle(document.documentElement);
  return Object.fromEntries(
    Object.entries(tokenNames).map(([key, variable]) => {
      const value = styles.getPropertyValue(variable).trim();
      return [key, value ? `hsl(${value})` : 'transparent'];
    }),
  ) as unknown as ChartTheme;
}

export function useChartTheme(): ChartTheme {
  const [theme, setTheme] = useState<ChartTheme>(() => readTheme());

  useEffect(() => {
    const refresh = () => setTheme(readTheme());
    const observer = new MutationObserver(refresh);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style'] });
    window.addEventListener('themeUpdated', refresh);
    window.addEventListener('theme-updated', refresh);
    return () => {
      observer.disconnect();
      window.removeEventListener('themeUpdated', refresh);
      window.removeEventListener('theme-updated', refresh);
    };
  }, []);

  return theme;
}