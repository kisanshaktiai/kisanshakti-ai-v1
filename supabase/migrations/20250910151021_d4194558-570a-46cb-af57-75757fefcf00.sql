-- Add comprehensive color configuration to white_label_configs
ALTER TABLE public.white_label_configs
ADD COLUMN IF NOT EXISTS theme_colors jsonb DEFAULT '{
  "core": {
    "primary": "142 76% 36%",
    "primary_foreground": "0 0% 100%",
    "secondary": "30 41% 48%",
    "secondary_foreground": "0 0% 100%",
    "accent": "199 89% 48%",
    "accent_foreground": "0 0% 100%",
    "success": "45 93% 47%",
    "success_foreground": "45 5% 15%",
    "destructive": "0 84% 60%",
    "destructive_foreground": "0 0% 98%",
    "background": "93 30% 98%",
    "foreground": "140 25% 15%",
    "card": "0 0% 100%",
    "card_foreground": "140 25% 15%",
    "popover": "0 0% 100%",
    "popover_foreground": "140 25% 15%",
    "muted": "60 5% 96%",
    "muted_foreground": "140 5% 40%",
    "border": "142 20% 90%",
    "input": "142 20% 90%",
    "ring": "142 76% 36%"
  },
  "navigation": {
    "nav_background": "0 0% 100%",
    "nav_border": "142 20% 90%",
    "nav_active": "142 76% 36%",
    "nav_inactive": "140 5% 60%"
  },
  "charts": {
    "chart_1": "12 76% 61%",
    "chart_2": "173 58% 39%",
    "chart_3": "197 37% 24%",
    "chart_4": "43 74% 66%",
    "chart_5": "27 87% 67%"
  },
  "maps": {
    "polygon_fill": "142 76% 36%",
    "polygon_stroke": "142 76% 28%",
    "marker_color": "0 84% 60%",
    "tracking_fill": "199 89% 48%",
    "tracking_stroke": "199 89% 38%"
  },
  "weather": {
    "sunny": "45 93% 47%",
    "cloudy": "214 14% 72%",
    "rainy": "199 89% 48%",
    "stormy": "240 5% 34%",
    "night": "222 47% 11%"
  },
  "gradients": {
    "primary": "linear-gradient(135deg, hsl(142 76% 36%), hsl(142 76% 44%))",
    "earth": "linear-gradient(180deg, hsl(199 89% 48%), hsl(93 30% 98%))",
    "sunrise": "linear-gradient(135deg, hsl(45 93% 47%), hsl(30 41% 48%))"
  },
  "dark_mode": {
    "enabled": false,
    "colors": {
      "background": "140 25% 10%",
      "foreground": "0 0% 95%",
      "card": "140 25% 15%",
      "card_foreground": "0 0% 95%",
      "primary": "142 76% 42%",
      "primary_foreground": "0 0% 100%",
      "secondary": "30 41% 58%",
      "muted": "140 20% 20%",
      "muted_foreground": "140 5% 65%",
      "border": "140 20% 25%",
      "nav_background": "140 25% 12%",
      "nav_border": "140 20% 25%",
      "nav_active": "142 76% 42%",
      "nav_inactive": "140 5% 50%"
    }
  }
}'::jsonb;

-- Update existing white_label_configs with default theme colors if they don't have them
UPDATE public.white_label_configs
SET theme_colors = '{
  "core": {
    "primary": "142 76% 36%",
    "primary_foreground": "0 0% 100%",
    "secondary": "30 41% 48%",
    "secondary_foreground": "0 0% 100%",
    "accent": "199 89% 48%",
    "accent_foreground": "0 0% 100%",
    "success": "45 93% 47%",
    "success_foreground": "45 5% 15%",
    "destructive": "0 84% 60%",
    "destructive_foreground": "0 0% 98%",
    "background": "93 30% 98%",
    "foreground": "140 25% 15%",
    "card": "0 0% 100%",
    "card_foreground": "140 25% 15%",
    "popover": "0 0% 100%",
    "popover_foreground": "140 25% 15%",
    "muted": "60 5% 96%",
    "muted_foreground": "140 5% 40%",
    "border": "142 20% 90%",
    "input": "142 20% 90%",
    "ring": "142 76% 36%"
  },
  "navigation": {
    "nav_background": "0 0% 100%",
    "nav_border": "142 20% 90%",
    "nav_active": "142 76% 36%",
    "nav_inactive": "140 5% 60%"
  },
  "charts": {
    "chart_1": "12 76% 61%",
    "chart_2": "173 58% 39%",
    "chart_3": "197 37% 24%",
    "chart_4": "43 74% 66%",
    "chart_5": "27 87% 67%"
  },
  "maps": {
    "polygon_fill": "142 76% 36%",
    "polygon_stroke": "142 76% 28%",
    "marker_color": "0 84% 60%",
    "tracking_fill": "199 89% 48%",
    "tracking_stroke": "199 89% 38%"
  },
  "weather": {
    "sunny": "45 93% 47%",
    "cloudy": "214 14% 72%",
    "rainy": "199 89% 48%",
    "stormy": "240 5% 34%",
    "night": "222 47% 11%"
  },
  "gradients": {
    "primary": "linear-gradient(135deg, hsl(142 76% 36%), hsl(142 76% 44%))",
    "earth": "linear-gradient(180deg, hsl(199 89% 48%), hsl(93 30% 98%))",
    "sunrise": "linear-gradient(135deg, hsl(45 93% 47%), hsl(30 41% 48%))"
  },
  "dark_mode": {
    "enabled": false,
    "colors": {}
  }
}'::jsonb
WHERE theme_colors IS NULL;

-- Create trigger to auto-create white_label_configs for new tenants
CREATE OR REPLACE FUNCTION create_white_label_config_for_tenant()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.white_label_configs (
    tenant_id,
    brand_identity,
    theme_colors
  ) VALUES (
    NEW.id,
    jsonb_build_object(
      'company_name', NEW.name,
      'tagline', 'Empowering Agriculture'
    ),
    '{
      "core": {
        "primary": "142 76% 36%",
        "primary_foreground": "0 0% 100%",
        "secondary": "30 41% 48%",
        "secondary_foreground": "0 0% 100%",
        "accent": "199 89% 48%",
        "accent_foreground": "0 0% 100%",
        "success": "45 93% 47%",
        "success_foreground": "45 5% 15%",
        "destructive": "0 84% 60%",
        "destructive_foreground": "0 0% 98%",
        "background": "93 30% 98%",
        "foreground": "140 25% 15%",
        "card": "0 0% 100%",
        "card_foreground": "140 25% 15%",
        "popover": "0 0% 100%",
        "popover_foreground": "140 25% 15%",
        "muted": "60 5% 96%",
        "muted_foreground": "140 5% 40%",
        "border": "142 20% 90%",
        "input": "142 20% 90%",
        "ring": "142 76% 36%"
      },
      "navigation": {
        "nav_background": "0 0% 100%",
        "nav_border": "142 20% 90%",
        "nav_active": "142 76% 36%",
        "nav_inactive": "140 5% 60%"
      },
      "charts": {
        "chart_1": "12 76% 61%",
        "chart_2": "173 58% 39%",
        "chart_3": "197 37% 24%",
        "chart_4": "43 74% 66%",
        "chart_5": "27 87% 67%"
      },
      "maps": {
        "polygon_fill": "142 76% 36%",
        "polygon_stroke": "142 76% 28%",
        "marker_color": "0 84% 60%",
        "tracking_fill": "199 89% 48%",
        "tracking_stroke": "199 89% 38%"
      },
      "weather": {
        "sunny": "45 93% 47%",
        "cloudy": "214 14% 72%",
        "rainy": "199 89% 48%",
        "stormy": "240 5% 34%",
        "night": "222 47% 11%"
      },
      "gradients": {
        "primary": "linear-gradient(135deg, hsl(142 76% 36%), hsl(142 76% 44%))",
        "earth": "linear-gradient(180deg, hsl(199 89% 48%), hsl(93 30% 98%))",
        "sunrise": "linear-gradient(135deg, hsl(45 93% 47%), hsl(30 41% 48%))"
      },
      "dark_mode": {
        "enabled": false,
        "colors": {}
      }
    }'::jsonb
  ) ON CONFLICT (tenant_id) DO NOTHING;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger only if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname = 'create_white_label_config_on_tenant_insert'
  ) THEN
    CREATE TRIGGER create_white_label_config_on_tenant_insert
    AFTER INSERT ON public.tenants
    FOR EACH ROW
    EXECUTE FUNCTION create_white_label_config_for_tenant();
  END IF;
END $$;