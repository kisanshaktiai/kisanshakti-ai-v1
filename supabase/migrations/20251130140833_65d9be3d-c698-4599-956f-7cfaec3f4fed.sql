-- Add multi-language columns to crop_groups table
ALTER TABLE crop_groups 
ADD COLUMN IF NOT EXISTS group_name_hi TEXT,
ADD COLUMN IF NOT EXISTS group_name_mr TEXT;

-- Add multi-language columns to crops table  
ALTER TABLE crops 
ADD COLUMN IF NOT EXISTS label_hi TEXT,
ADD COLUMN IF NOT EXISTS label_mr TEXT;

-- Update crop_groups with Hindi and Marathi translations
UPDATE crop_groups SET 
  group_name_hi = 'अनाज',
  group_name_mr = 'धान्ये'
WHERE group_name = 'Cereals';

UPDATE crop_groups SET 
  group_name_hi = 'सब्जियां',
  group_name_mr = 'भाज्या'
WHERE group_name = 'Vegetables';

UPDATE crop_groups SET 
  group_name_hi = 'फल',
  group_name_mr = 'फळे'
WHERE group_name = 'Fruits';

UPDATE crop_groups SET 
  group_name_hi = 'तिलहन',
  group_name_mr = 'तेलबिया'
WHERE group_name = 'Oilseeds';

UPDATE crop_groups SET 
  group_name_hi = 'दालें',
  group_name_mr = 'डाळी'
WHERE group_name = 'Pulses';

UPDATE crop_groups SET 
  group_name_hi = 'मसाले',
  group_name_mr = 'मसाले'
WHERE group_name = 'Spices';

UPDATE crop_groups SET 
  group_name_hi = 'रेशे',
  group_name_mr = 'तंतु'
WHERE group_name = 'Fiber Crops';

UPDATE crop_groups SET 
  group_name_hi = 'चारा फसलें',
  group_name_mr = 'चारा पिके'
WHERE group_name = 'Fodder Crops';

-- Update crops with Hindi and Marathi translations (Major crops)
UPDATE crops SET 
  label_hi = 'चावल',
  label_mr = 'तांदूळ'
WHERE label = 'Rice';

UPDATE crops SET 
  label_hi = 'गेहूं',
  label_mr = 'गहू'
WHERE label = 'Wheat';

UPDATE crops SET 
  label_hi = 'गन्ना',
  label_mr = 'ऊस'
WHERE label = 'Sugarcane';

UPDATE crops SET 
  label_hi = 'कपास',
  label_mr = 'कापूस'
WHERE label = 'Cotton';

UPDATE crops SET 
  label_hi = 'मक्का',
  label_mr = 'मका'
WHERE label = 'Maize' OR label = 'Corn';

UPDATE crops SET 
  label_hi = 'बाजरा',
  label_mr = 'बाजरी'
WHERE label = 'Pearl Millet' OR label = 'Bajra';

UPDATE crops SET 
  label_hi = 'ज्वार',
  label_mr = 'ज्वारी'
WHERE label = 'Sorghum' OR label = 'Jowar';

UPDATE crops SET 
  label_hi = 'अरहर',
  label_mr = 'तूर'
WHERE label = 'Pigeon Pea' OR label = 'Tur';

UPDATE crops SET 
  label_hi = 'मूंग',
  label_mr = 'मूग'
WHERE label = 'Green Gram' OR label = 'Moong';

UPDATE crops SET 
  label_hi = 'चना',
  label_mr = 'हरभरा'
WHERE label = 'Chickpea' OR label = 'Gram';

UPDATE crops SET 
  label_hi = 'सोयाबीन',
  label_mr = 'सोयाबीन'
WHERE label = 'Soybean';

UPDATE crops SET 
  label_hi = 'मूंगफली',
  label_mr = 'भुईमूग'
WHERE label = 'Groundnut' OR label = 'Peanut';

UPDATE crops SET 
  label_hi = 'सूरजमुखी',
  label_mr = 'सूर्यफूल'
WHERE label = 'Sunflower';

UPDATE crops SET 
  label_hi = 'टमाटर',
  label_mr = 'टोमॅटो'
WHERE label = 'Tomato';

UPDATE crops SET 
  label_hi = 'आलू',
  label_mr = 'बटाटा'
WHERE label = 'Potato';

UPDATE crops SET 
  label_hi = 'प्याज',
  label_mr = 'कांदा'
WHERE label = 'Onion';

UPDATE crops SET 
  label_hi = 'मिर्च',
  label_mr = 'मिरची'
WHERE label = 'Chilli' OR label = 'Chili';

UPDATE crops SET 
  label_hi = 'बैंगन',
  label_mr = 'वांगी'
WHERE label = 'Brinjal' OR label = 'Eggplant';

UPDATE crops SET 
  label_hi = 'भिंडी',
  label_mr = 'भेंडी'
WHERE label = 'Okra' OR label = 'Ladyfinger';

UPDATE crops SET 
  label_hi = 'आम',
  label_mr = 'आंबा'
WHERE label = 'Mango';

UPDATE crops SET 
  label_hi = 'केला',
  label_mr = 'केळ'
WHERE label = 'Banana';

UPDATE crops SET 
  label_hi = 'अंगूर',
  label_mr = 'द्राक्षे'
WHERE label = 'Grapes';

UPDATE crops SET 
  label_hi = 'संतरा',
  label_mr = 'संत्रा'
WHERE label = 'Orange';

UPDATE crops SET 
  label_hi = 'अनार',
  label_mr = 'डाळिंब'
WHERE label = 'Pomegranate';

UPDATE crops SET 
  label_hi = 'हल्दी',
  label_mr = 'हळद'
WHERE label = 'Turmeric';

UPDATE crops SET 
  label_hi = 'अदरक',
  label_mr = 'आले'
WHERE label = 'Ginger';

UPDATE crops SET 
  label_hi = 'लहसुन',
  label_mr = 'लसूण'
WHERE label = 'Garlic';

UPDATE crops SET 
  label_hi = 'धनिया',
  label_mr = 'कोथिंबीर'
WHERE label = 'Coriander';

-- Add comments for future reference
COMMENT ON COLUMN crop_groups.group_name_hi IS 'Crop group name in Hindi';
COMMENT ON COLUMN crop_groups.group_name_mr IS 'Crop group name in Marathi';
COMMENT ON COLUMN crops.label_hi IS 'Crop name in Hindi';
COMMENT ON COLUMN crops.label_mr IS 'Crop name in Marathi';