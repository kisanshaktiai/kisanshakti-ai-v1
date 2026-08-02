INSERT INTO public.system_config (config_key, config_value)
VALUES
 ('not_understood_en', to_jsonb('I could not understand your question well enough to give safe advice. Please tell me in a few words what you see in your field.'::text)),
 ('not_understood_hi', to_jsonb('मैं आपका सवाल ठीक से समझ नहीं पाया, इसलिए सुरक्षित सलाह नहीं दे सकता। कृपया बताइए कि खेत में आपको क्या दिख रहा है।'::text)),
 ('not_understood_mr', to_jsonb('तुमचा प्रश्न मला नीट समजला नाही, त्यामुळे सुरक्षित सल्ला देता येत नाही. कृपया शेतात तुम्हाला काय दिसत आहे ते सांगा.'::text))
ON CONFLICT (config_key) DO NOTHING;