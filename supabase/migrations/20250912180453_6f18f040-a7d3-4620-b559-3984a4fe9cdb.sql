-- First add new columns if they don't exist
ALTER TABLE crops ADD COLUMN IF NOT EXISTS local_name TEXT;
ALTER TABLE crops ADD COLUMN IF NOT EXISTS is_popular BOOLEAN DEFAULT false;
ALTER TABLE crops ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';

-- Update existing crops with local names and mark popular ones
UPDATE crops SET 
  local_name = CASE value
    -- Grains
    WHEN 'rice' THEN 'धान / चावल'
    WHEN 'wheat' THEN 'गेहूं'
    WHEN 'maize' THEN 'मक्का'
    WHEN 'jowar' THEN 'ज्वार'
    WHEN 'bajra' THEN 'बाजरा'
    WHEN 'barley' THEN 'जौ'
    
    -- Pulses
    WHEN 'tur' THEN 'तूर / अरहर'
    WHEN 'gram' THEN 'चना'
    WHEN 'masoor' THEN 'मसूर'
    WHEN 'moong' THEN 'मूंग'
    WHEN 'urad' THEN 'उड़द'
    WHEN 'peas' THEN 'मटर'
    
    -- Oilseeds
    WHEN 'groundnut' THEN 'मूंगफली'
    WHEN 'mustard' THEN 'सरसों'
    WHEN 'soybean' THEN 'सोयाबीन'
    WHEN 'sunflower' THEN 'सूरजमुखी'
    WHEN 'sesame' THEN 'तिल'
    WHEN 'linseed' THEN 'अलसी'
    
    -- Cash Crops
    WHEN 'cotton' THEN 'कपास'
    WHEN 'sugarcane' THEN 'गन्ना'
    WHEN 'jute' THEN 'जूट'
    WHEN 'tea' THEN 'चाय'
    WHEN 'coffee' THEN 'कॉफी'
    WHEN 'rubber' THEN 'रबर'
    WHEN 'coconut' THEN 'नारियल'
    WHEN 'arecanut' THEN 'सुपारी'
    WHEN 'cashew' THEN 'काजू'
    
    -- Vegetables
    WHEN 'tomato' THEN 'टमाटर'
    WHEN 'onion' THEN 'प्याज'
    WHEN 'potato' THEN 'आलू'
    WHEN 'chili' THEN 'मिर्च'
    WHEN 'brinjal' THEN 'बैंगन'
    WHEN 'okra' THEN 'भिंडी'
    WHEN 'cabbage' THEN 'पत्तागोभी'
    WHEN 'cauliflower' THEN 'फूलगोभी'
    WHEN 'carrot' THEN 'गाजर'
    WHEN 'radish' THEN 'मूली'
    WHEN 'spinach' THEN 'पालक'
    WHEN 'bottle_gourd' THEN 'लौकी'
    WHEN 'bitter_gourd' THEN 'करेला'
    WHEN 'cucumber' THEN 'खीरा'
    WHEN 'pumpkin' THEN 'कद्दू'
    WHEN 'ridge_gourd' THEN 'तोरई'
    
    -- Fruits
    WHEN 'mango' THEN 'आम'
    WHEN 'banana' THEN 'केला'
    WHEN 'papaya' THEN 'पपीता'
    WHEN 'guava' THEN 'अमरूद'
    WHEN 'pomegranate' THEN 'अनार'
    WHEN 'grapes' THEN 'अंगूर'
    WHEN 'orange' THEN 'संतरा'
    WHEN 'lemon' THEN 'नींबू'
    WHEN 'watermelon' THEN 'तरबूज'
    WHEN 'muskmelon' THEN 'खरबूजा'
    WHEN 'apple' THEN 'सेब'
    WHEN 'litchi' THEN 'लीची'
    
    ELSE local_name
  END,
  is_popular = value IN ('rice', 'wheat', 'cotton', 'sugarcane', 'maize', 'tomato', 'onion', 'potato', 'groundnut', 'mustard', 'soybean', 'tur'),
  metadata = jsonb_build_object(
    'min_temp', CASE 
      WHEN value IN ('rice', 'cotton', 'sugarcane') THEN 20
      WHEN value IN ('wheat', 'mustard', 'gram') THEN 10
      ELSE 15
    END,
    'max_temp', CASE
      WHEN value IN ('rice', 'cotton', 'sugarcane') THEN 35
      WHEN value IN ('wheat', 'mustard', 'gram') THEN 25
      ELSE 30
    END,
    'water_requirement', CASE
      WHEN value IN ('rice', 'sugarcane', 'banana') THEN 'high'
      WHEN value IN ('cotton', 'wheat', 'maize') THEN 'medium'
      ELSE 'low'
    END
  )
WHERE local_name IS NULL OR local_name = '';

-- Update season information with accurate data
UPDATE crops SET season = CASE 
  -- Kharif crops (June-October)
  WHEN value IN ('rice', 'cotton', 'sugarcane', 'maize', 'jowar', 'bajra', 'tur', 'groundnut', 'soybean', 'sesame', 'urad', 'moong') THEN 'kharif'
  
  -- Rabi crops (October-March)
  WHEN value IN ('wheat', 'mustard', 'gram', 'peas', 'barley', 'linseed', 'masoor', 'sunflower') THEN 'rabi'
  
  -- Zaid crops (April-June)
  WHEN value IN ('watermelon', 'muskmelon', 'cucumber', 'bottle_gourd', 'bitter_gourd', 'pumpkin') THEN 'zaid'
  
  -- Year-round crops
  WHEN value IN ('tomato', 'onion', 'potato', 'chili', 'brinjal', 'okra', 'spinach', 'banana', 'papaya', 'coconut') THEN 'all_season'
  
  ELSE season
END
WHERE season = 'Varies' OR season IS NULL OR season = '';

-- Create indexes for better search performance
CREATE INDEX IF NOT EXISTS idx_crops_local_name ON crops(local_name);
CREATE INDEX IF NOT EXISTS idx_crops_is_popular ON crops(is_popular);
CREATE INDEX IF NOT EXISTS idx_crops_season ON crops(season);