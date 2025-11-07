import { 
  Wheat, 
  Calendar, 
  MessageSquare, 
  ShoppingCart, 
  Sun, 
  Users, 
  Satellite, 
  Building2,
  BarChart3,
  User,
  Shield,
  DollarSign,
  Leaf,
  FileText
} from 'lucide-react';

export interface FeatureItem {
  id: string;
  icon: any;
  labelKey: string;
  path: string;
  enabled: boolean;
  comingSoon?: boolean;
  order: number;
  category?: string;
  requiredPermissions?: string[];
  color?: string; // Theme-based color reference
}

// Central feature configuration
// All features are ENABLED by default (except comingSoon)
// Tenant settings can DISABLE specific features if needed
export const defaultFeatures: FeatureItem[] = [
  {
    id: 'lands',
    icon: Wheat,
    labelKey: 'fab.myLands',
    path: '/app/lands',
    enabled: true, // Enabled by default
    order: 1,
    category: 'farm-management'
  },
  {
    id: 'schedule',
    icon: Calendar,
    labelKey: 'fab.aiSchedule',
    path: '/app/schedule',
    enabled: true, // Enabled by default
    order: 2,
    category: 'ai-tools'
  },
  {
    id: 'chat',
    icon: MessageSquare,
    labelKey: 'fab.aiChat',
    path: '/app/chat',
    enabled: true, // Enabled by default
    order: 3,
    category: 'ai-tools'
  },
  {
    id: 'market',
    icon: ShoppingCart,
    labelKey: 'fab.market',
    path: '/app/market',
    enabled: true, // Enabled by default
    order: 4,
    category: 'commerce'
  },
  {
    id: 'weather',
    icon: Sun,
    labelKey: 'fab.weather',
    path: '/app/weather',
    enabled: true, // Enabled by default
    order: 5,
    category: 'tools'
  },
  {
    id: 'social',
    icon: Users,
    labelKey: 'fab.community',
    path: '/app/social',
    enabled: true, // Enabled by default
    order: 6,
    category: 'community'
  },
  {
    id: 'ndvi',
    icon: Satellite,
    labelKey: 'fab.ndviSatellite',
    path: '/app/ndvi',
    enabled: true, // Enabled by default
    order: 7,
    category: 'tools'
  },
  {
    id: 'schemes',
    icon: Building2,
    labelKey: 'fab.govSchemes',
    path: '/app/schemes',
    enabled: true, // Enabled by default
    order: 8,
    category: 'resources'
  },
  {
    id: 'analytics',
    icon: BarChart3,
    labelKey: 'fab.analytics',
    path: '/app/analytics',
    enabled: true, // Enabled by default
    order: 9,
    category: 'tools'
  },
  {
    id: 'profile',
    icon: User,
    labelKey: 'fab.profile',
    path: '/app/profile',
    enabled: true, // Enabled by default
    order: 10,
    category: 'account'
  },
  {
    id: 'insurance',
    icon: Shield,
    labelKey: 'fab.insurance',
    path: '/app/insurance',
    enabled: false, // Coming soon - disabled
    comingSoon: true,
    order: 11,
    category: 'services'
  },
  {
    id: 'loan',
    icon: DollarSign,
    labelKey: 'fab.loan',
    path: '/app/loan',
    enabled: false, // Coming soon - disabled
    comingSoon: true,
    order: 12,
    category: 'services'
  }
];

// Feature categories for organization
export const featureCategories = {
  'farm-management': {
    name: 'Farm Management',
    icon: Leaf,
    order: 1
  },
  'ai-tools': {
    name: 'AI Tools',
    icon: MessageSquare,
    order: 2
  },
  'commerce': {
    name: 'Commerce',
    icon: ShoppingCart,
    order: 3
  },
  'tools': {
    name: 'Tools',
    icon: FileText,
    order: 4
  },
  'community': {
    name: 'Community',
    icon: Users,
    order: 5
  },
  'resources': {
    name: 'Resources',
    icon: Building2,
    order: 6
  },
  'services': {
    name: 'Services',
    icon: Shield,
    order: 7
  },
  'account': {
    name: 'Account',
    icon: User,
    order: 8
  }
};