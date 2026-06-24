import { useEffect, useState } from 'react';
import { X, Lock } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';
import { useTenant } from '@/contexts/TenantContext';
import { toast } from '@/hooks/use-toast';
import { useEntitlements } from '@/hooks/useEntitlements';
import {
  Home, MapPin, Cloud, Users, Bot, TrendingUp, User,
  Calendar, FileText, Award, Bell, Settings, HelpCircle,
  Wallet, BarChart3, Sprout, Tractor, Droplets, Sun,
  MessageSquare, Store, BookOpen, Shield, Phone, Mail, Crown
} from 'lucide-react';

// Map menu paths to entitlement feature codes (SSOT: resolve_farmer_entitlements)
const PATH_TO_ENTITLEMENT: Record<string, string> = {
  '/app/chat': 'ai_chat',
  '/app/ai-chat': 'ai_chat',
  '/app/market': 'marketplace',
  '/app/weather': 'weather_forecast',
  '/app/community': 'community',
  '/app/ndvi': 'ndvi',
};

interface MenuItemType {
  id: string;
  icon: any;
  labelKey: string;
  path: string;
  category: string;
  isNew?: boolean;
  isPremium?: boolean;
  comingSoon?: boolean;
}

const defaultMenuItems: MenuItemType[] = [
  // Core Features - All routes exist
  { id: 'home', icon: Home, labelKey: 'menu.home', path: '/app/home', category: 'main' },
  { id: 'lands', icon: MapPin, labelKey: 'menu.lands', path: '/app/lands', category: 'main' },
  { id: 'weather', icon: Cloud, labelKey: 'menu.weather', path: '/app/weather', category: 'main' },
  { id: 'schedule', icon: Calendar, labelKey: 'menu.schedule', path: '/app/schedule', category: 'main' },
  
  // AI & Analytics - All routes exist
  { id: 'ai-chat', icon: Bot, labelKey: 'menu.aiChat', path: '/app/chat', category: 'ai', isNew: true },
  { id: 'analytics', icon: BarChart3, labelKey: 'menu.analytics', path: '/app/analytics', category: 'ai' },
  { id: 'advisory', icon: Sprout, labelKey: 'menu.advisory', path: '/app/advisory', category: 'ai' },
  { id: 'crop-growth', icon: Sprout, labelKey: 'menu.cropGrowth', path: '/app/crop-growth', category: 'ai', isNew: true },
  
  // Community & Market
  { id: 'community', icon: Users, labelKey: 'menu.community', path: '/app/community', category: 'social' },
  { id: 'market', icon: Store, labelKey: 'menu.market', path: '/app/market', category: 'social' },
  { id: 'videos', icon: MessageSquare, labelKey: 'menu.videos', path: '/app/videos', category: 'social' },
  
  // Finance & Resources
  { id: 'schemes', icon: Shield, labelKey: 'menu.schemes', path: '/app/schemes', category: 'resources' },
  { id: 'finance', icon: Wallet, labelKey: 'menu.finance', path: '/app/finance', category: 'resources', isPremium: true, comingSoon: true },
  
  // Farm Management - Coming Soon
  { id: 'ndvi', icon: Tractor, labelKey: 'menu.ndvi', path: '/app/ndvi', category: 'farm' },
  { id: 'irrigation', icon: Droplets, labelKey: 'menu.irrigation', path: '/app/irrigation', category: 'farm', comingSoon: true },
  { id: 'solar', icon: Sun, labelKey: 'menu.solar', path: '/app/solar', category: 'farm', isNew: true, comingSoon: true },
  
  // Account & Settings
  { id: 'profile', icon: User, labelKey: 'menu.profile', path: '/app/profile', category: 'account' },
  { id: 'subscription', icon: Crown, labelKey: 'menu.subscription', path: '/app/subscription', category: 'account', isNew: true },
  { id: 'notifications', icon: Bell, labelKey: 'menu.notifications', path: '/app/notifications/settings', category: 'account' },
  { id: 'settings', icon: Settings, labelKey: 'menu.settings', path: '/app/profile', category: 'account' },
  
  // Support - Coming Soon
  { id: 'help', icon: HelpCircle, labelKey: 'menu.help', path: '/app/help', category: 'support', comingSoon: true },
  { id: 'contact', icon: Phone, labelKey: 'menu.contact', path: '/app/contact', category: 'support', comingSoon: true },
];

interface HindenburgMenuProps {
  isOpen: boolean;
  onClose: () => void;
}

export function HindenburgMenu({ isOpen, onClose }: HindenburgMenuProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { tenant } = useTenant();
  const [searchQuery, setSearchQuery] = useState('');
  const [menuItems, setMenuItems] = useState(defaultMenuItems);
  const [activeCategory, setActiveCategory] = useState('all');
  const { isReady, canUse, farmer } = useEntitlements();

  // Load tenant-specific menu items from database
  useEffect(() => {
    // In the future, tenant-specific menu items can be loaded from the database
    // For now, use default menu items
    setMenuItems(defaultMenuItems);
  }, [tenant]);

  const isItemLocked = (path: string): boolean => {
    if (!isReady) return false;
    const code = PATH_TO_ENTITLEMENT[path];
    if (!code) return false;
    return !canUse(code).allowed;
  };

  const handleItemClick = (item: MenuItemType) => {
    if (item.comingSoon) {
      toast({
        title: t('common.comingSoon', 'Coming Soon'),
        description: t('common.featureInDevelopment', 'This feature is currently in development'),
      });
      return;
    }
    // Plan-gating: locked items route to subscription page instead of feature.
    if (isItemLocked(item.path)) {
      toast({
        title: t('subscription.gate.feature_disabled.title', 'Premium feature'),
        description: t('subscription.gate.feature_disabled.body', {
          defaultValue: 'Upgrade your plan to unlock this feature.',
          plan: farmer?.plan_name ?? 'Free',
        }),
      });
      navigate('/app/subscription');
      onClose();
      return;
    }
    navigate(item.path);
    onClose();
  };

  const categories = [
    { id: 'all', label: t('menu.all') },
    { id: 'main', label: t('menu.main') },
    { id: 'ai', label: t('menu.ai') },
    { id: 'social', label: t('menu.social') },
    { id: 'resources', label: t('menu.resources') },
    { id: 'farm', label: t('menu.farm') },
    { id: 'account', label: t('menu.account') },
    { id: 'support', label: t('menu.support') },
  ];

  const filteredItems = menuItems.filter(item => {
    const matchesSearch = searchQuery === '' || 
      t(item.labelKey).toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = activeCategory === 'all' || item.category === activeCategory;
    return matchesSearch && matchesCategory;
  });

  return (
    <>
      {/* Backdrop */}
      <div 
        className={cn(
          "fixed inset-0 bg-background/60 backdrop-blur-sm z-[60] transition-opacity duration-300",
          isOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
        onClick={onClose}
      />

      {/* Menu Drawer */}
      <div 
        className={cn(
          "fixed inset-x-0 bottom-0 z-[70] transition-all duration-500 ease-out",
          "max-h-[90vh] rounded-t-3xl",
          "glassmorphism-strong border-t border-border/20",
          "shadow-3xl",
          isOpen ? "translate-y-0" : "translate-y-full"
        )}
      >
        {/* Handle Bar */}
        <div className="flex justify-center pt-2 pb-1">
          <div className="w-12 h-1.5 rounded-full bg-muted-foreground/20" />
        </div>

        {/* Header */}
        <div className="sticky top-0 z-10 glassmorphism-subtle border-b border-border/10 px-4 pb-3">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
              {t('menu.allFeatures')}
            </h2>
            <button
              onClick={onClose}
              className="w-10 h-10 rounded-full glassmorphism flex items-center justify-center transition-all hover:scale-110 active:scale-95"
            >
              <X className="w-5 h-5 text-muted-foreground" />
            </button>
          </div>

          {/* Search Bar */}
          <input
            type="text"
            placeholder={t('menu.search')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-4 py-2.5 rounded-2xl glassmorphism-subtle bg-background/50 border border-border/20 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
          />

          {/* Category Tabs */}
          <div className="flex gap-2 mt-3 overflow-x-auto scrollbar-hide">
            {categories.map(cat => (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className={cn(
                  "px-4 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all",
                  activeCategory === cat.id
                    ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20"
                    : "glassmorphism-subtle text-muted-foreground hover:bg-muted/50"
                )}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>

        {/* Menu Grid */}
        <div className="px-4 py-4 overflow-y-auto max-h-[60vh] scrollbar-thin">
          <div className="grid grid-cols-4 gap-3">
            {filteredItems.map((item) => {
              const Icon = item.icon;
              const locked = isItemLocked(item.path);
              return (
                <button
                  key={item.id}
                  onClick={() => handleItemClick(item)}
                  className={cn(
                    "relative flex flex-col items-center justify-center p-3 rounded-2xl",
                    "glassmorphism-subtle hover:glassmorphism",
                    "transition-all duration-300 group",
                    "hover:scale-105 active:scale-95",
                    "min-h-[90px]",
                    item.comingSoon && "opacity-60",
                    locked && "opacity-75"
                  )}
                  aria-disabled={locked}
                >
                  {/* Badge */}
                  {item.isNew && !item.comingSoon && !locked && (
                    <span className="absolute -top-1 -right-1 px-1.5 py-0.5 text-[8px] font-bold bg-accent text-white rounded-full animate-pulse">
                      NEW
                    </span>
                  )}
                  {item.isPremium && !locked && (
                    <span className="absolute -top-1 -right-1 px-1.5 py-0.5 text-[8px] font-bold bg-gradient-to-r from-primary to-accent text-white rounded-full">
                      PRO
                    </span>
                  )}
                  {item.comingSoon && (
                    <span className="absolute -top-1 -right-1 px-1.5 py-0.5 text-[8px] font-bold bg-muted text-muted-foreground rounded-full">
                      SOON
                    </span>
                  )}
                  {locked && (
                    <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-background border border-border flex items-center justify-center shadow-sm">
                      <Lock className="w-2.5 h-2.5 text-muted-foreground" />
                    </span>
                  )}

                  {/* Icon Container */}
                  <div className={cn(
                    "w-12 h-12 rounded-xl flex items-center justify-center",
                    "bg-gradient-to-br from-primary/10 to-accent/10",
                    "group-hover:from-primary/20 group-hover:to-accent/20",
                    "transition-all duration-300",
                    item.comingSoon && "from-muted/20 to-muted/10 group-hover:from-muted/20 group-hover:to-muted/10",
                    locked && "grayscale"
                  )}>
                    <Icon className={cn(
                      "w-6 h-6 group-hover:scale-110 transition-transform",
                      item.comingSoon ? "text-muted-foreground" : "text-primary"
                    )} />
                  </div>


                  {/* Label */}
                  <span className={cn(
                    "text-[10px] mt-2 font-medium text-center transition-colors line-clamp-2",
                    item.comingSoon ? "text-muted-foreground" : "text-foreground/70 group-hover:text-foreground"
                  )}>
                    {t(item.labelKey)}
                  </span>
                </button>
              );
            })}
          </div>

          {filteredItems.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              <p className="text-sm">{t('menu.noResults')}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-border/10 glassmorphism-subtle">
          <p className="text-[10px] text-center text-muted-foreground/50">
            {(tenant?.branding?.tagline && tenant.branding.tagline.trim()) || t('app.tagline')}
          </p>
        </div>
      </div>
    </>
  );
}