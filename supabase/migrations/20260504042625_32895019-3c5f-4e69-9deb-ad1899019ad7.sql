UPDATE public.farmers
SET pin_hash = encode(
  extensions.digest((pin_hash || 'kisan_shakti_2024')::bytea, 'sha256'),
  'hex'
),
    pin_updated_at = now()
WHERE pin_hash IS NOT NULL AND length(pin_hash) <> 64;