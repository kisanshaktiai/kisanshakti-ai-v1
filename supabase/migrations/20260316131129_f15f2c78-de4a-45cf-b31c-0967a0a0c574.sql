-- Update soil_health texture to 'black' for Kolhapur region lands where texture is NULL
UPDATE soil_health SET texture = 'black', updated_at = now() WHERE texture IS NULL;