import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Plus, 
  X, 
  MapPin, 
  FileText, 
  DollarSign,
  Calendar,
  Cloud,
  ShoppingBag
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';

const fabItems = [
  { id: 'land', icon: MapPin, labelKey: 'fab.addLand', path: '/app/lands', color: 'from-green-500 to-emerald-500' },
  { id: 'notes', icon: FileText, labelKey: 'fab.addNote', path: '/app/chat', color: 'from-blue-500 to-cyan-500' },
  { id: 'finance', icon: DollarSign, labelKey: 'fab.addFinance', path: '/app/market', color: 'from-purple-500 to-pink-500' },
  { id: 'schedule', icon: Calendar, labelKey: 'fab.schedule', path: '/app/schedule', color: 'from-orange-500 to-red-500' },
  { id: 'weather', icon: Cloud, labelKey: 'fab.weather', path: '/app/weather', color: 'from-sky-500 to-indigo-500' },
  { id: 'market', icon: ShoppingBag, labelKey: 'fab.market', path: '/app/market', color: 'from-teal-500 to-green-500' }
];

// Helper function to extract gradient colors
const getGradientColors = (colorString: string) => {
  const fromColor = colorString.match(/from-(\S+)/)?.[1] || 'primary';
  const toColor = colorString.match(/to-(\S+)/)?.[1] || 'primary-glow';
  
  // Convert Tailwind color names to actual colors
  const colorMap: Record<string, string> = {
    'green-500': '#10b981',
    'emerald-500': '#10b981',
    'blue-500': '#3b82f6',
    'cyan-500': '#06b6d4',
    'purple-500': '#a855f7',
    'pink-500': '#ec4899',
    'orange-500': '#f97316',
    'red-500': '#ef4444',
    'sky-500': '#0ea5e9',
    'indigo-500': '#6366f1',
    'teal-500': '#14b8a6',
  };
  
  const from = colorMap[fromColor] || 'var(--primary)';
  const to = colorMap[toColor] || 'var(--primary-glow)';
  
  return `${from}, ${to}`;
};

export function FloatingActionButton() {
  const [isExpanded, setIsExpanded] = useState(false);
  const { t } = useTranslation();
  const navigate = useNavigate();

  const handleItemClick = (path: string) => {
    navigate(path);
    setIsExpanded(false);
  };

  return (
    <>
      {/* Backdrop */}
      {isExpanded && (
        <div 
          className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 animate-fade-in"
          onClick={() => setIsExpanded(false)}
        />
      )}

      {/* FAB Container */}
      <div className="fixed bottom-24 right-4 z-50">
        {/* Expanded Menu Items */}
        <div className={cn(
          "absolute bottom-16 right-0 transition-all duration-300",
          isExpanded ? "opacity-100 visible" : "opacity-0 invisible"
        )}>
          <div className="space-y-3">
            {fabItems.map((item, index) => (
              <div
                key={item.id}
                className={cn(
                  "flex items-center gap-3 justify-end",
                  "transition-all duration-300",
                  isExpanded 
                    ? "translate-x-0 opacity-100" 
                    : "translate-x-8 opacity-0"
                )}
                style={{
                  transitionDelay: isExpanded ? `${index * 50}ms` : '0ms'
                }}
              >
                {/* Label */}
                <div className={cn(
                  "glassmorphism px-3 py-1.5 rounded-lg",
                  "text-sm font-medium whitespace-nowrap",
                  "shadow-lg"
                )}>
                  {t(item.labelKey)}
                </div>

                {/* Icon Button */}
                <button
                  onClick={() => handleItemClick(item.path)}
                  className={cn(
                    "w-12 h-12 rounded-full",
                    "shadow-xl",
                    "flex items-center justify-center",
                    "transition-all duration-300",
                    "hover:scale-110 active:scale-95",
                    "text-white"
                  )}
                  style={{
                    backgroundImage: `linear-gradient(135deg, ${getGradientColors(item.color)})`
                  }}
                >
                  <item.icon className="w-5 h-5" />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Main FAB Button */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className={cn(
            "w-14 h-14 rounded-full",
            "bg-gradient-to-br from-primary via-accent to-primary-glow",
            "shadow-2xl shadow-primary/30",
            "flex items-center justify-center",
            "transition-all duration-300",
            "hover:scale-110 hover:shadow-3xl hover:shadow-primary/40",
            "active:scale-95",
            isExpanded && "rotate-45"
          )}
        >
          <Plus className={cn(
            "w-6 h-6 text-white transition-transform duration-300",
            isExpanded && "rotate-45"
          )} />
        </button>
      </div>
    </>
  );
}