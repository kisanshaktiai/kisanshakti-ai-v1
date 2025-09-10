-- Insert white label configuration for KisanShakti Ai tenant
INSERT INTO public.white_label_configs (
  tenant_id,
  brand_identity,
  theme_colors,
  app_customization,
  pwa_config,
  created_at,
  updated_at
) VALUES (
  'a2a59533-b5d2-450c-bd70-7180aa40d82d',
  jsonb_build_object(
    'company_name', 'KisanShakti Ai',
    'tagline', 'Empowering Farmers with AI',
    'logo_url', 'https://qfklkkzxemsbeniyugiz.supabase.co/storage/v1/object/public/kisanshaktiai_partner/logo/kisanshakti-logo.png',
    'favicon_url', 'https://qfklkkzxemsbeniyugiz.supabase.co/storage/v1/object/public/kisanshaktiai_partner/logo/kisanshakti-logo.png',
    'primary_color', '#10b981',
    'secondary_color', '#8b5cf6',
    'accent_color', '#3b82f6',
    'background_color', '#ffffff',
    'text_color', '#1f2937',
    'font_family', 'Inter'
  ),
  jsonb_build_object(
    'core', jsonb_build_object(
      'primary', '142 76% 36%',
      'primary_foreground', '0 0% 100%',
      'secondary', '271 91% 65%',
      'secondary_foreground', '0 0% 100%',
      'accent', '217 91% 60%',
      'accent_foreground', '0 0% 100%',
      'success', '142 71% 45%',
      'success_foreground', '0 0% 100%',
      'destructive', '0 84% 60%',
      'destructive_foreground', '0 0% 98%',
      'background', '0 0% 100%',
      'foreground', '222 47% 11%',
      'card', '0 0% 100%',
      'card_foreground', '222 47% 11%',
      'popover', '0 0% 100%',
      'popover_foreground', '222 47% 11%',
      'muted', '210 40% 96%',
      'muted_foreground', '215 16% 47%',
      'border', '214 32% 91%',
      'input', '214 32% 91%',
      'ring', '142 76% 36%'
    ),
    'navigation', jsonb_build_object(
      'nav_background', '0 0% 100%',
      'nav_border', '214 32% 91%',
      'nav_active', '142 76% 36%',
      'nav_inactive', '215 16% 47%'
    ),
    'charts', jsonb_build_object(
      'chart_1', '12 76% 61%',
      'chart_2', '173 58% 39%',
      'chart_3', '197 37% 24%',
      'chart_4', '43 74% 66%',
      'chart_5', '27 87% 67%'
    ),
    'maps', jsonb_build_object(
      'polygon_fill', '142 76% 36%',
      'polygon_stroke', '142 76% 28%',
      'marker_color', '0 84% 60%',
      'tracking_fill', '217 91% 60%',
      'tracking_stroke', '217 91% 50%'
    ),
    'weather', jsonb_build_object(
      'sunny', '45 93% 47%',
      'cloudy', '214 14% 72%',
      'rainy', '217 91% 60%',
      'stormy', '240 5% 34%',
      'night', '222 47% 11%'
    ),
    'gradients', jsonb_build_object(
      'primary', 'linear-gradient(135deg, hsl(142 76% 36%), hsl(142 76% 44%))',
      'earth', 'linear-gradient(180deg, hsl(217 91% 60%), hsl(0 0% 100%))',
      'sunrise', 'linear-gradient(135deg, hsl(45 93% 47%), hsl(271 91% 65%))'
    ),
    'dark_mode', jsonb_build_object(
      'enabled', false,
      'colors', jsonb_build_object()
    )
  ),
  jsonb_build_object(
    'theme_mode', 'light',
    'card_style', 'elevated',
    'button_style', 'rounded',
    'navigation_style', 'bottom',
    'animations_enabled', true
  ),
  jsonb_build_object(
    'app_name', 'KisanShakti Ai',
    'short_name', 'KS Ai',
    'theme_color', '#10b981',
    'background_color', '#ffffff',
    'display', 'standalone',
    'orientation', 'portrait',
    'start_url', '/',
    'icons', jsonb_build_array(
      jsonb_build_object(
        'src', 'https://qfklkkzxemsbeniyugiz.supabase.co/storage/v1/object/public/kisanshaktiai_partner/logo/kisanshakti-logo.png',
        'sizes', '192x192',
        'type', 'image/png'
      ),
      jsonb_build_object(
        'src', 'https://qfklkkzxemsbeniyugiz.supabase.co/storage/v1/object/public/kisanshaktiai_partner/logo/kisanshakti-logo.png',
        'sizes', '512x512',
        'type', 'image/png'
      )
    )
  ),
  now(),
  now()
) ON CONFLICT (tenant_id) 
DO UPDATE SET
  brand_identity = EXCLUDED.brand_identity,
  theme_colors = EXCLUDED.theme_colors,
  app_customization = EXCLUDED.app_customization,
  pwa_config = EXCLUDED.pwa_config,
  updated_at = now();