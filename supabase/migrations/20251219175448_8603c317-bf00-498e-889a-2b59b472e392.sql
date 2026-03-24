-- =========================================
-- Populate commodity_category with Marathi crop groups
-- =========================================

-- धान्ये (Grains/Cereals)
UPDATE market_prices SET commodity_category = 'धान्ये' 
WHERE crop_name ILIKE ANY(ARRAY['%गहू%', '%ज्वारी%', '%बाजरी%', '%मका%', '%तांदूळ%', '%भात%', '%धान%', '%नाचणी%', '%राळा%', '%वरई%', '%wheat%', '%jowar%', '%bajra%', '%maize%', '%rice%', '%paddy%', '%ragi%', '%sorghum%', '%millet%']);

-- डाळी (Pulses/Lentils)
UPDATE market_prices SET commodity_category = 'डाळी' 
WHERE crop_name ILIKE ANY(ARRAY['%तूर%', '%उडीद%', '%मूग%', '%हरभरा%', '%मसूर%', '%चवळी%', '%मटकी%', '%कुळीथ%', '%tur%', '%urad%', '%moong%', '%chana%', '%gram%', '%lentil%', '%dal%', '%pulse%', '%masoor%']);

-- भाज्या (Vegetables)
UPDATE market_prices SET commodity_category = 'भाज्या' 
WHERE crop_name ILIKE ANY(ARRAY['%कांदा%', '%टोमॅटो%', '%बटाटा%', '%मिरची%', '%वांगी%', '%कोबी%', '%फ्लॉवर%', '%गाजर%', '%मुळा%', '%भेंडी%', '%पालक%', '%मेथी%', '%कोथिंबीर%', '%कारले%', '%दोडका%', '%दुधी%', '%भोपळा%', '%काकडी%', '%शिमला%', '%onion%', '%tomato%', '%potato%', '%chilli%', '%brinjal%', '%cabbage%', '%cauliflower%', '%carrot%', '%radish%', '%okra%', '%spinach%', '%fenugreek%', '%coriander%', '%bitter%', '%gourd%', '%cucumber%', '%capsicum%', '%vegetable%']);

-- फळे (Fruits)
UPDATE market_prices SET commodity_category = 'फळे' 
WHERE crop_name ILIKE ANY(ARRAY['%आंबा%', '%केळी%', '%संत्री%', '%मोसंबी%', '%द्राक्षे%', '%डाळिंब%', '%पेरू%', '%चिकू%', '%पपई%', '%सफरचंद%', '%लिंबू%', '%सीताफळ%', '%अंजीर%', '%जांभूळ%', '%कलिंगड%', '%खरबूज%', '%mango%', '%banana%', '%orange%', '%grape%', '%pomegranate%', '%guava%', '%papaya%', '%apple%', '%lemon%', '%watermelon%', '%fruit%']);

-- मसाले (Spices)
UPDATE market_prices SET commodity_category = 'मसाले' 
WHERE crop_name ILIKE ANY(ARRAY['%हळद%', '%मिरची%', '%आले%', '%लसूण%', '%जिरे%', '%धने%', '%मोहरी%', '%मेथी दाणे%', '%लवंग%', '%वेलची%', '%दालचिनी%', '%काळी मिरी%', '%turmeric%', '%ginger%', '%garlic%', '%cumin%', '%coriander seed%', '%mustard%', '%fenugreek seed%', '%clove%', '%cardamom%', '%cinnamon%', '%pepper%', '%spice%']);

-- तेलबिया (Oilseeds)
UPDATE market_prices SET commodity_category = 'तेलबिया' 
WHERE crop_name ILIKE ANY(ARRAY['%भुईमूग%', '%सोयाबीन%', '%सूर्यफूल%', '%तीळ%', '%करडई%', '%जवस%', '%मोहरी%', '%groundnut%', '%peanut%', '%soybean%', '%sunflower%', '%sesame%', '%safflower%', '%linseed%', '%oilseed%', '%oil%']);

-- गूळ व साखर (Jaggery & Sugar)
UPDATE market_prices SET commodity_category = 'गूळ व साखर' 
WHERE crop_name ILIKE ANY(ARRAY['%गूळ%', '%साखर%', '%ऊस%', '%jaggery%', '%sugar%', '%sugarcane%', '%gur%']);

-- कापूस व तंतू (Cotton & Fiber)
UPDATE market_prices SET commodity_category = 'कापूस' 
WHERE crop_name ILIKE ANY(ARRAY['%कापूस%', '%cotton%', '%fiber%', '%kapas%']);

-- Set remaining to 'इतर' (Others)
UPDATE market_prices SET commodity_category = 'इतर' 
WHERE commodity_category IS NULL OR commodity_category = '';

-- =========================================
-- Create auto-categorization trigger function
-- =========================================
CREATE OR REPLACE FUNCTION auto_set_crop_category()
RETURNS TRIGGER AS $$
BEGIN
  -- Skip if already set
  IF NEW.commodity_category IS NOT NULL AND NEW.commodity_category != '' THEN
    RETURN NEW;
  END IF;
  
  -- Auto-categorize based on crop_name
  NEW.commodity_category := CASE
    -- धान्ये (Grains)
    WHEN NEW.crop_name ILIKE ANY(ARRAY['%गहू%', '%ज्वारी%', '%बाजरी%', '%मका%', '%तांदूळ%', '%भात%', '%धान%', '%नाचणी%', '%wheat%', '%jowar%', '%bajra%', '%maize%', '%rice%', '%paddy%', '%ragi%', '%sorghum%', '%millet%']) THEN 'धान्ये'
    -- डाळी (Pulses)
    WHEN NEW.crop_name ILIKE ANY(ARRAY['%तूर%', '%उडीद%', '%मूग%', '%हरभरा%', '%मसूर%', '%चवळी%', '%tur%', '%urad%', '%moong%', '%chana%', '%gram%', '%lentil%', '%dal%', '%pulse%']) THEN 'डाळी'
    -- भाज्या (Vegetables)
    WHEN NEW.crop_name ILIKE ANY(ARRAY['%कांदा%', '%टोमॅटो%', '%बटाटा%', '%मिरची%', '%वांगी%', '%कोबी%', '%गाजर%', '%मुळा%', '%भेंडी%', '%पालक%', '%onion%', '%tomato%', '%potato%', '%chilli%', '%brinjal%', '%cabbage%', '%carrot%', '%vegetable%']) THEN 'भाज्या'
    -- फळे (Fruits)
    WHEN NEW.crop_name ILIKE ANY(ARRAY['%आंबा%', '%केळी%', '%संत्री%', '%द्राक्षे%', '%डाळिंब%', '%पेरू%', '%पपई%', '%सफरचंद%', '%mango%', '%banana%', '%orange%', '%grape%', '%pomegranate%', '%guava%', '%papaya%', '%apple%', '%fruit%']) THEN 'फळे'
    -- मसाले (Spices)
    WHEN NEW.crop_name ILIKE ANY(ARRAY['%हळद%', '%आले%', '%लसूण%', '%जिरे%', '%धने%', '%turmeric%', '%ginger%', '%garlic%', '%cumin%', '%spice%']) THEN 'मसाले'
    -- तेलबिया (Oilseeds)
    WHEN NEW.crop_name ILIKE ANY(ARRAY['%भुईमूग%', '%सोयाबीन%', '%सूर्यफूल%', '%तीळ%', '%groundnut%', '%peanut%', '%soybean%', '%sunflower%', '%sesame%', '%oil%']) THEN 'तेलबिया'
    -- गूळ व साखर (Jaggery & Sugar)
    WHEN NEW.crop_name ILIKE ANY(ARRAY['%गूळ%', '%साखर%', '%ऊस%', '%jaggery%', '%sugar%', '%sugarcane%']) THEN 'गूळ व साखर'
    -- कापूस (Cotton)
    WHEN NEW.crop_name ILIKE ANY(ARRAY['%कापूस%', '%cotton%', '%kapas%']) THEN 'कापूस'
    ELSE 'इतर'
  END;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if exists
DROP TRIGGER IF EXISTS trigger_auto_set_crop_category ON market_prices;

-- Create trigger for new inserts
CREATE TRIGGER trigger_auto_set_crop_category
  BEFORE INSERT ON market_prices
  FOR EACH ROW
  EXECUTE FUNCTION auto_set_crop_category();