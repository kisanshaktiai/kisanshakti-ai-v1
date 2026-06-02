
INSERT INTO public.master_companies (name, slug, company_type, sector, description, status)
VALUES
  ('Indian Agricultural Research Institute (IARI)', 'iari-pusa', 'research_institute', 'public', 'ICAR-IARI, New Delhi — breeder of Pusa varieties', 'active'),
  ('Central Institute for Cotton Research (CICR)', 'cicr-nagpur', 'research_institute', 'public', 'ICAR-CICR, Nagpur', 'active'),
  ('Indian Institute of Maize Research (IIMR)', 'iimr-icar', 'research_institute', 'public', 'ICAR-IIMR, Ludhiana', 'active'),
  ('Indian Institute of Horticultural Research (IIHR)', 'iihr-bengaluru', 'research_institute', 'public', 'ICAR-IIHR, Bengaluru', 'active'),
  ('Central Potato Research Institute (CPRI)', 'cpri-shimla', 'research_institute', 'public', 'ICAR-CPRI, Shimla', 'active'),
  ('Directorate of Onion and Garlic Research (DOGR)', 'dogr-pune', 'research_institute', 'public', 'ICAR-DOGR, Pune', 'active'),
  ('Sugarcane Breeding Institute (SBI)', 'sbi-coimbatore', 'research_institute', 'public', 'ICAR-SBI, Coimbatore', 'active'),
  ('Indian Institute of Wheat and Barley Research (IIWBR)', 'iiwbr-karnal', 'research_institute', 'public', 'ICAR-IIWBR, Karnal', 'active'),
  ('Indian Institute of Soybean Research (IISR)', 'iisr-indore', 'research_institute', 'public', 'ICAR-IISR, Indore', 'active'),
  ('ICRISAT', 'icrisat', 'research_institute', 'public', 'ICRISAT, Hyderabad', 'active'),
  ('IRRI', 'irri', 'research_institute', 'public', 'International Rice Research Institute', 'active'),
  ('Punjab Agricultural University (PAU)', 'pau-ludhiana', 'research_institute', 'public', 'PAU, Ludhiana', 'active'),
  ('CCS Haryana Agricultural University (CCSHAU)', 'ccshau-hisar', 'research_institute', 'public', 'CCS HAU, Hisar', 'active'),
  ('Acharya N. G. Ranga Agricultural University (ANGRAU)', 'angrau', 'research_institute', 'public', 'ANGRAU', 'active'),
  ('Jawaharlal Nehru Krishi Vishwa Vidyalaya (JNKVV)', 'jnkvv-jabalpur', 'research_institute', 'public', 'JNKVV, Jabalpur', 'active'),
  ('Mahatma Phule Krishi Vidyapeeth (MPKV)', 'mpkv-rahuri', 'research_institute', 'public', 'MPKV, Rahuri', 'active'),
  ('Vasantrao Naik Marathwada Krishi Vidyapeeth (VNMKV)', 'vnmkv-parbhani', 'research_institute', 'public', 'VNMKV, Parbhani', 'active'),
  ('National Horticultural Research and Development Foundation (NHRDF)', 'nhrdf-nashik', 'research_institute', 'public', 'NHRDF, Nashik', 'active'),
  ('Bhabha Atomic Research Centre (BARC)', 'barc-mumbai', 'research_institute', 'public', 'BARC, Mumbai', 'active'),
  ('Mahyco Seeds Ltd', 'mahyco-seeds', 'seed_company', 'private', 'Maharashtra Hybrid Seeds Company, Jalna', 'active'),
  ('Nuziveedu Seeds Ltd', 'nuziveedu-seeds', 'seed_company', 'private', 'Hyderabad', 'active'),
  ('Kaveri Seed Company Ltd', 'kaveri-seeds', 'seed_company', 'private', 'Secunderabad', 'active'),
  ('Rasi Seeds Pvt Ltd', 'rasi-seeds', 'seed_company', 'private', 'Attur, Tamil Nadu', 'active'),
  ('Ankur Seeds Pvt Ltd', 'ankur-seeds', 'seed_company', 'private', 'Nagpur', 'active'),
  ('Corteva Agriscience (Pioneer)', 'pioneer-corteva', 'seed_company', 'private', 'Pioneer / Corteva Hi-Bred', 'active'),
  ('Bayer Vegetable Seeds (Seminis)', 'bayer-vegetable-seeds', 'seed_company', 'private', 'Bayer / Seminis vegetable seeds', 'active')
ON CONFLICT (slug) DO NOTHING;

CREATE TEMP TABLE _v_seed (
  variety_code text, name text, label_hi text, label_mr text,
  company_slug text, crop_value text, season text,
  maturity_min int, maturity_max int, yield_qtl_per_acre numeric,
  released_by text, parentage text, recommended_regions jsonb, is_featured boolean
);
INSERT INTO _v_seed VALUES
('IR-64','Rice IR-64','धान IR-64','भात IR-64','irri','rice','kharif',125,130,22,'IRRI / ICAR (1983)',NULL,'["Andhra Pradesh","Tamil Nadu","Karnataka","Odisha"]'::jsonb,true),
('MTU-1010','Rice MTU-1010 (Cottondora Sannalu)','धान MTU-1010','भात MTU-1010','angrau','rice','kharif',110,120,25,'ANGRAU (2000)',NULL,'["Andhra Pradesh","Telangana","Karnataka","Tamil Nadu"]'::jsonb,true),
('MTU-7029','Rice Swarna (MTU-7029)','धान स्वर्णा','भात स्वर्णा','angrau','rice','kharif',140,150,24,'ANGRAU (1982)',NULL,'["Andhra Pradesh","Odisha","West Bengal","Bihar","Uttar Pradesh"]'::jsonb,true),
('BPT-5204','Rice Samba Mahsuri (BPT-5204)','धान साम्बा मसूरी','भात साम्बा मसूरी','angrau','rice','kharif',140,150,22,'APRRI Bapatla (1986)',NULL,'["Andhra Pradesh","Telangana","Tamil Nadu","Karnataka"]'::jsonb,true),
('PB-1121','Rice Pusa Basmati 1121','पूसा बासमती 1121','पूसा बासमती 1121','iari-pusa','rice','kharif',140,150,18,'IARI (2003)','Basmati','["Punjab","Haryana","Western UP","Uttarakhand"]'::jsonb,true),
('PB-1509','Rice Pusa Basmati 1509','पूसा बासमती 1509','पूसा बासमती 1509','iari-pusa','rice','kharif',115,125,16,'IARI (2013)','Basmati','["Punjab","Haryana","Western UP"]'::jsonb,true),
('Pusa-44','Rice Pusa-44','पूसा-44','पूसा-44','iari-pusa','rice','kharif',155,160,28,'IARI',NULL,'["Punjab","Haryana"]'::jsonb,false),
('PR-126','Rice PR-126','PR-126','PR-126','pau-ludhiana','rice','kharif',120,125,30,'PAU Ludhiana (2017)',NULL,'["Punjab"]'::jsonb,true),
('BPT-3291','Rice Sona Mahsuri (BPT-3291)','सोना मसूरी','सोना मसूरी','angrau','rice','kharif',130,140,22,'APRRI Bapatla','BPT-1235 x Sona','["Andhra Pradesh","Karnataka","Tamil Nadu"]'::jsonb,true),
('HD-2967','Wheat HD-2967','गेहूं HD-2967','गहू HD-2967','iari-pusa','wheat','rabi',145,150,22,'IARI (2011)',NULL,'["Punjab","Haryana","Western UP","Rajasthan","Delhi"]'::jsonb,true),
('HD-3086','Wheat HD-3086 (Pusa Gautami)','गेहूं HD-3086','गहू HD-3086','iari-pusa','wheat','rabi',142,148,23,'IARI (2014)',NULL,'["Punjab","Haryana","Western UP","Rajasthan"]'::jsonb,true),
('HD-3226','Wheat HD-3226 (Pusa Yashasvi)','गेहूं HD-3226','गहू HD-3226','iari-pusa','wheat','rabi',142,148,25,'IARI (2019)',NULL,'["Punjab","Haryana","UP","Rajasthan","MP"]'::jsonb,true),
('DBW-187','Wheat DBW-187 (Karan Vandana)','गेहूं करन वंदना','गहू करन वंदना','iiwbr-karnal','wheat','rabi',145,150,26,'IIWBR Karnal (2018)',NULL,'["Eastern UP","Bihar","West Bengal","Jharkhand"]'::jsonb,true),
('DBW-222','Wheat DBW-222 (Karan Narendra)','गेहूं करन नरेंद्र','गहू करन नरेंद्र','iiwbr-karnal','wheat','rabi',140,148,25,'IIWBR Karnal (2020)',NULL,'["Punjab","Haryana","UP","Rajasthan"]'::jsonb,true),
('WH-1105','Wheat WH-1105','गेहूं WH-1105','गहू WH-1105','ccshau-hisar','wheat','rabi',150,157,24,'CCSHAU Hisar',NULL,'["Haryana","Punjab","Rajasthan"]'::jsonb,false),
('PBW-725','Wheat PBW-725','गेहूं PBW-725','गहू PBW-725','pau-ludhiana','wheat','rabi',150,160,22,'PAU Ludhiana (2017)',NULL,'["Punjab"]'::jsonb,false),
('HI-1544','Wheat HI-1544 (Pusa Ojaswi)','गेहूं HI-1544','गहू HI-1544','iari-pusa','wheat','rabi',100,115,18,'IARI Indore',NULL,'["MP","Gujarat","Maharashtra"]'::jsonb,false),
('Lok-1','Wheat Lok-1','गेहूं लोक-1','गहू लोक-1','iari-pusa','wheat','rabi',105,115,18,'GAU (1981)',NULL,'["Gujarat","MP","Rajasthan"]'::jsonb,false),
('Suraj','Cotton Suraj','कपास सूरज','कापूस सूरज','cicr-nagpur','cotton','kharif',160,180,8,'CICR Nagpur','Pure line','["Maharashtra","Gujarat","MP","Karnataka"]'::jsonb,true),
('MRC-7351','Cotton Mahyco MRC-7351 Bollgard II','कपास MRC-7351','कापूस MRC-7351','mahyco-seeds','cotton','kharif',160,180,10,'Mahyco','Bt hybrid','["Maharashtra","Gujarat","MP","AP","Telangana"]'::jsonb,true),
('RCH-659','Cotton Rasi RCH-659 BG II','कपास RCH-659','कापूस RCH-659','rasi-seeds','cotton','kharif',150,170,11,'Rasi Seeds','Bt hybrid','["Maharashtra","Telangana","AP","Gujarat"]'::jsonb,true),
('NCS-145','Cotton Nuziveedu NCS-145 Bunny','कपास नुजीवीडू बनी','कापूस नुजीवीडू बनी','nuziveedu-seeds','cotton','kharif',160,180,10,'Nuziveedu Seeds','Bt hybrid','["AP","Telangana","Maharashtra","Karnataka"]'::jsonb,false),
('Ankur-3028','Cotton Ankur 3028 BG II','कपास Ankur 3028','कापूस Ankur 3028','ankur-seeds','cotton','kharif',160,180,10,'Ankur Seeds','Bt hybrid','["Maharashtra","Gujarat","MP"]'::jsonb,false),
('Co-0238','Sugarcane Co-0238 (Karan-4)','गन्ना Co-0238','ऊस Co-0238','sbi-coimbatore','sugarcane','perennial',300,365,320,'ICAR-SBI / SBI Coimbatore (2009)',NULL,'["UP","Uttarakhand","Punjab","Haryana","Bihar"]'::jsonb,true),
('Co-86032','Sugarcane Co-86032 (Nayana)','गन्ना Co-86032','ऊस Co-86032','sbi-coimbatore','sugarcane','perennial',330,365,300,'SBI Coimbatore (1998)',NULL,'["Tamil Nadu","Karnataka","AP","Maharashtra"]'::jsonb,true),
('CoM-0265','Sugarcane CoM-0265','गन्ना CoM-0265','ऊस CoM-0265','mpkv-rahuri','sugarcane','perennial',360,420,360,'VSI / MPKV',NULL,'["Maharashtra","Karnataka"]'::jsonb,true),
('Co-92005','Sugarcane Co-92005','गन्ना Co-92005','ऊस Co-92005','sbi-coimbatore','sugarcane','perennial',300,365,280,'SBI Coimbatore',NULL,'["Tamil Nadu","Karnataka","AP"]'::jsonb,false),
('CoS-8436','Sugarcane CoS-8436','गन्ना CoS-8436','ऊस CoS-8436','sbi-coimbatore','sugarcane','perennial',300,365,280,'UPCSR Shahjahanpur',NULL,'["UP","Bihar"]'::jsonb,false),
('DHM-117','Maize DHM-117','मक्का DHM-117','मका DHM-117','iimr-icar','maize','kharif',90,95,22,'ICAR-IIMR',NULL,'["Karnataka","AP","Maharashtra","MP"]'::jsonb,false),
('HQPM-1','Maize HQPM-1 (Quality Protein)','मक्का HQPM-1','मका HQPM-1','ccshau-hisar','maize','kharif',90,95,24,'CCSHAU (2005)','QPM hybrid','["Haryana","Punjab","UP","Bihar"]'::jsonb,true),
('PMH-1','Maize PMH-1','मक्का PMH-1','मका PMH-1','pau-ludhiana','maize','kharif',90,95,24,'PAU Ludhiana',NULL,'["Punjab","Haryana"]'::jsonb,false),
('Pioneer-30V92','Maize Pioneer 30V92','मक्का Pioneer 30V92','मका Pioneer 30V92','pioneer-corteva','maize','kharif',95,105,28,'Pioneer / Corteva','Single cross hybrid','["Bihar","UP","MP","Karnataka"]'::jsonb,true),
('NK-6240','Maize Syngenta NK-6240','मक्का NK-6240','मका NK-6240','syngenta-india','maize','kharif',95,105,28,'Syngenta',NULL,'["Bihar","Karnataka","Maharashtra","MP"]'::jsonb,true),
('JS-335','Soybean JS-335','सोयाबीन JS-335','सोयाबीन JS-335','jnkvv-jabalpur','soybean','kharif',95,100,12,'JNKVV (1994)',NULL,'["MP","Maharashtra","Rajasthan"]'::jsonb,true),
('JS-9560','Soybean JS-9560','सोयाबीन JS-9560','सोयाबीन JS-9560','jnkvv-jabalpur','soybean','kharif',82,88,12,'JNKVV (2009)',NULL,'["MP","Maharashtra","Rajasthan"]'::jsonb,true),
('JS-2034','Soybean JS-2034','सोयाबीन JS-2034','सोयाबीन JS-2034','jnkvv-jabalpur','soybean','kharif',86,90,11,'JNKVV',NULL,'["MP","Maharashtra"]'::jsonb,false),
('NRC-37','Soybean NRC-37 (Ahilya-4)','सोयाबीन NRC-37','सोयाबीन NRC-37','iisr-indore','soybean','kharif',99,105,13,'ICAR-IISR Indore',NULL,'["MP","Maharashtra","Rajasthan","Karnataka"]'::jsonb,false),
('MAUS-71','Soybean MAUS-71 (Samrudhi)','सोयाबीन MAUS-71','सोयाबीन MAUS-71','vnmkv-parbhani','soybean','kharif',93,98,12,'VNMKV Parbhani',NULL,'["Maharashtra","Karnataka"]'::jsonb,false),
('Pusa-Ruby','Tomato Pusa Ruby','टमाटर पूसा रूबी','टोमॅटो पूसा रूबी','iari-pusa','tomato','kharif',60,70,60,'IARI','Open pollinated','["All India"]'::jsonb,true),
('Pusa-Rohini','Tomato Pusa Rohini','टमाटर पूसा रोहिणी','टोमॅटो पूसा रोहिणी','iari-pusa','tomato','rabi',60,70,80,'IARI','Open pollinated','["All India"]'::jsonb,true),
('Arka-Vikas','Tomato Arka Vikas','टमाटर अर्का विकास','टोमॅटो अर्का विकास','iihr-bengaluru','tomato','kharif',120,130,140,'ICAR-IIHR',NULL,'["Karnataka","Tamil Nadu","AP"]'::jsonb,false),
('Arka-Rakshak','Tomato Arka Rakshak F1','टमाटर अर्का रक्षक','टोमॅटो अर्का रक्षक','iihr-bengaluru','tomato','rabi',140,150,300,'ICAR-IIHR (2010)','Triple disease resistant F1','["All India"]'::jsonb,true),
('Arka-Samrat','Tomato Arka Samrat F1','टमाटर अर्का सम्राट','टोमॅटो अर्का सम्राट','iihr-bengaluru','tomato','rabi',140,150,320,'ICAR-IIHR','Triple disease resistant F1','["All India"]'::jsonb,true),
('Hisar-Arun','Tomato Hisar Arun (Sel-7)','टमाटर हिसार अरुण','टोमॅटो हिसार अरुण','ccshau-hisar','tomato','rabi',90,110,100,'CCSHAU Hisar',NULL,'["Haryana","Punjab"]'::jsonb,false),
('Pusa-Red','Onion Pusa Red','प्याज पूसा रेड','कांदा पूसा रेड','iari-pusa','onion','rabi',140,150,120,'IARI',NULL,'["North India"]'::jsonb,true),
('Agrifound-Dark-Red','Onion Agrifound Dark Red','प्याज एग्रीफाउंड डार्क रेड','कांदा एग्रीफाउंड डार्क रेड','nhrdf-nashik','onion','kharif',95,110,120,'NHRDF Nashik',NULL,'["Maharashtra","Karnataka","Gujarat"]'::jsonb,true),
('Bhima-Super','Onion Bhima Super','प्याज भीमा सुपर','कांदा भीमा सुपर','dogr-pune','onion','kharif',100,110,120,'ICAR-DOGR Pune',NULL,'["Maharashtra","Karnataka","MP","Gujarat"]'::jsonb,true),
('Bhima-Shakti','Onion Bhima Shakti','प्याज भीमा शक्ति','कांदा भीमा शक्ती','dogr-pune','onion','rabi',110,120,140,'ICAR-DOGR Pune','Long storage','["Maharashtra","Karnataka","MP"]'::jsonb,true),
('N-53','Onion N-53','प्याज N-53','कांदा N-53','nhrdf-nashik','onion','kharif',95,105,100,'NHRDF Nashik',NULL,'["Maharashtra"]'::jsonb,false),
('Kufri-Jyoti','Potato Kufri Jyoti','आलू कुफरी ज्योति','बटाटा कुफरी ज्योति','cpri-shimla','potato','rabi',90,110,140,'ICAR-CPRI Shimla (1968)',NULL,'["Punjab","UP","WB","Bihar","Karnataka"]'::jsonb,true),
('Kufri-Pukhraj','Potato Kufri Pukhraj','आलू कुफरी पुखराज','बटाटा कुफरी पुखराज','cpri-shimla','potato','rabi',75,90,160,'ICAR-CPRI Shimla (1998)',NULL,'["Punjab","UP","Bihar","WB","Gujarat"]'::jsonb,true),
('Kufri-Bahar','Potato Kufri Bahar','आलू कुफरी बहार','बटाटा कुफरी बहार','cpri-shimla','potato','rabi',90,105,140,'ICAR-CPRI Shimla',NULL,'["UP","Punjab","Haryana"]'::jsonb,false),
('Kufri-Chandramukhi','Potato Kufri Chandramukhi','आलू कुफरी चंद्रमुखी','बटाटा कुफरी चंद्रमुखी','cpri-shimla','potato','rabi',80,90,100,'ICAR-CPRI Shimla',NULL,'["Punjab","UP","Maharashtra"]'::jsonb,false),
('Kufri-Sindhuri','Potato Kufri Sindhuri','आलू कुफरी सिंदूरी','बटाटा कुफरी सिंदूरी','cpri-shimla','potato','rabi',100,120,120,'ICAR-CPRI Shimla',NULL,'["MP","UP","Bihar"]'::jsonb,false),
('JG-11','Gram JG-11','चना JG-11','हरभरा JG-11','jnkvv-jabalpur','gram','rabi',95,110,12,'JNKVV (1999)',NULL,'["MP","Maharashtra","Karnataka","AP"]'::jsonb,true),
('JAKI-9218','Gram JAKI-9218','चना JAKI-9218','हरभरा JAKI-9218','jnkvv-jabalpur','gram','rabi',105,115,14,'JNKVV (2007)','Wilt resistant','["MP","Maharashtra","UP"]'::jsonb,true),
('Vijay','Gram Vijay (Phule G-81-1-1)','चना विजय','हरभरा विजय','mpkv-rahuri','gram','rabi',95,105,12,'MPKV Rahuri',NULL,'["Maharashtra","Karnataka"]'::jsonb,true),
('Vishal','Gram Vishal','चना विशाल','हरभरा विशाल','mpkv-rahuri','gram','rabi',110,120,13,'MPKV Rahuri','Bold seeded kabuli','["Maharashtra","Karnataka"]'::jsonb,false),
('BG-256','Gram BG-256','चना BG-256','हरभरा BG-256','iari-pusa','gram','rabi',135,145,12,'IARI',NULL,'["North India"]'::jsonb,false),
('Pusa-Bold','Mustard Pusa Bold','सरसों पूसा बोल्ड','मोहरी पूसा बोल्ड','iari-pusa','mustard','rabi',130,140,10,'IARI',NULL,'["Rajasthan","UP","Haryana","MP"]'::jsonb,true),
('Pusa-Mahak','Mustard Pusa Mahak (JD-6)','सरसों पूसा महक','मोहरी पूसा महक','iari-pusa','mustard','rabi',105,115,9,'IARI','Early maturing','["Rajasthan","UP","Haryana"]'::jsonb,true),
('RH-30','Mustard RH-30','सरसों RH-30','मोहरी RH-30','ccshau-hisar','mustard','rabi',130,140,10,'CCSHAU Hisar',NULL,'["Haryana","Punjab","Rajasthan"]'::jsonb,true),
('Varuna','Mustard Varuna (T-59)','सरसों वरुणा','मोहरी वरुणा','iari-pusa','mustard','rabi',125,140,9,'IARI',NULL,'["UP","Bihar","WB","Odisha"]'::jsonb,false),
('Pusa-Vijay','Mustard Pusa Vijay','सरसों पूसा विजय','मोहरी पूसा विजय','iari-pusa','mustard','rabi',135,145,11,'IARI',NULL,'["Rajasthan","UP","MP"]'::jsonb,false),
('TAG-24','Groundnut TAG-24','मूंगफली TAG-24','भुईमूग TAG-24','barc-mumbai','groundnut','kharif',100,110,9,'BARC',NULL,'["Maharashtra","Gujarat","Karnataka","AP"]'::jsonb,true),
('TG-37A','Groundnut TG-37A','मूंगफली TG-37A','भुईमूग TG-37A','barc-mumbai','groundnut','kharif',110,115,10,'BARC (2004)',NULL,'["Maharashtra","Gujarat","Karnataka"]'::jsonb,true),
('GG-20','Groundnut GG-20','मूंगफली GG-20','भुईमूग GG-20','jnkvv-jabalpur','groundnut','kharif',110,115,10,'JAU Junagadh',NULL,'["Gujarat","Rajasthan"]'::jsonb,false),
('Kadiri-6','Groundnut Kadiri-6 (K-6)','मूंगफली कादिरी-6','भुईमूग कादिरी-6','angrau','groundnut','kharif',110,120,11,'ANGRAU Kadiri',NULL,'["AP","Telangana","Karnataka","Tamil Nadu"]'::jsonb,true),
('ICGS-76','Groundnut ICGS-76','मूंगफली ICGS-76','भुईमूग ICGS-76','icrisat','groundnut','kharif',115,125,10,'ICRISAT',NULL,'["AP","Karnataka","Maharashtra"]'::jsonb,false),
('HHB-67-Improved','Bajra HHB-67 Improved','बाजरा HHB-67 इम्प्रूव्ड','बाजरी HHB-67 इम्प्रूव्ड','ccshau-hisar','bajra','kharif',65,75,12,'CCSHAU Hisar','Downy mildew resistant','["Rajasthan","Haryana","Gujarat"]'::jsonb,true),
('HHB-226','Bajra HHB-226','बाजरा HHB-226','बाजरी HHB-226','ccshau-hisar','bajra','kharif',75,82,14,'CCSHAU Hisar',NULL,'["Haryana","Rajasthan","UP"]'::jsonb,false),
('ICTP-8203','Bajra ICTP-8203','बाजरा ICTP-8203','बाजरी ICTP-8203','icrisat','bajra','kharif',80,85,13,'ICRISAT','High iron','["Maharashtra","Karnataka","AP"]'::jsonb,true),
('RHB-177','Bajra RHB-177','बाजरा RHB-177','बाजरी RHB-177','angrau','bajra','kharif',75,82,12,'Rajasthan Agri Univ',NULL,'["Rajasthan"]'::jsonb,false),
('CSV-15','Jowar CSV-15','ज्वार CSV-15','ज्वारी CSV-15','iimr-icar','jowar','kharif',105,115,12,'ICAR-IIMR',NULL,'["Maharashtra","Karnataka","MP","AP"]'::jsonb,false),
('CSH-16','Jowar CSH-16 Hybrid','ज्वार CSH-16','ज्वारी CSH-16','iimr-icar','jowar','kharif',105,115,16,'ICAR-IIMR','Single cross hybrid','["Maharashtra","Karnataka","AP"]'::jsonb,true),
('M-35-1','Jowar Maldandi (M-35-1)','ज्वार मालदांडी','ज्वारी मालदांडी','vnmkv-parbhani','jowar','rabi',115,125,9,'VNMKV Parbhani',NULL,'["Maharashtra","Karnataka"]'::jsonb,true),
('Pusa-Jwala','Chilli Pusa Jwala','मिर्च पूसा ज्वाला','मिरची पूसा ज्वाला','iari-pusa','chilli','kharif',130,150,32,'IARI',NULL,'["All India"]'::jsonb,true),
('Pusa-Sadabahar','Chilli Pusa Sadabahar','मिर्च पूसा सदाबहार','मिरची पूसा सदाबहार','iari-pusa','chilli','perennial',180,365,40,'IARI','Perennial bearing','["All India"]'::jsonb,false),
('Arka-Lohit','Chilli Arka Lohit','मिर्च अर्का लोहित','मिरची अर्का लोहित','iihr-bengaluru','chilli','kharif',150,180,40,'ICAR-IIHR',NULL,'["Karnataka","Tamil Nadu","AP"]'::jsonb,true),
('LCA-235','Chilli LCA-235','मिर्च LCA-235','मिरची LCA-235','angrau','chilli','kharif',150,180,80,'LAM Centre, ANGRAU',NULL,'["Andhra Pradesh","Telangana"]'::jsonb,true);

CREATE TEMP TABLE _crop_cat (crop_value text, category_id uuid);
INSERT INTO _crop_cat VALUES
  ('rice','b25657f2-0a5e-4379-943e-93ec29ce1293'),
  ('wheat','b25657f2-0a5e-4379-943e-93ec29ce1293'),
  ('maize','b25657f2-0a5e-4379-943e-93ec29ce1293'),
  ('bajra','b25657f2-0a5e-4379-943e-93ec29ce1293'),
  ('jowar','b25657f2-0a5e-4379-943e-93ec29ce1293'),
  ('gram','9ecebaf1-325f-4a21-9756-7330a437a9df'),
  ('mustard','71db8fb4-c50d-429f-8d73-80a04b0b8017'),
  ('soybean','71db8fb4-c50d-429f-8d73-80a04b0b8017'),
  ('groundnut','71db8fb4-c50d-429f-8d73-80a04b0b8017'),
  ('tomato','2d197fed-eef6-414a-b3c8-8ab30537e73d'),
  ('onion','2d197fed-eef6-414a-b3c8-8ab30537e73d'),
  ('potato','2d197fed-eef6-414a-b3c8-8ab30537e73d'),
  ('chilli','2d197fed-eef6-414a-b3c8-8ab30537e73d'),
  ('cotton','13b74107-c60a-4e1a-a828-d44090b1adaf'),
  ('sugarcane','13b74107-c60a-4e1a-a828-d44090b1adaf');

INSERT INTO public.master_products (
  sku, name, brand, product_type, category_id, status, visibility,
  company_id, crop_id, variety_code,
  label_hi, label_mr, season,
  maturity_days_min, maturity_days_max,
  yield_potential_qtl_per_acre,
  released_by, parentage, recommended_regions,
  is_featured, ai_recommendable
)
SELECT
  'SEED-' || UPPER(REPLACE(mc.slug,'-','')) || '-' || UPPER(REPLACE(v.variety_code,'-','')) AS sku,
  v.name, mc.name, 'seed', cc.category_id, 'active', 'global',
  mc.id, c.id, v.variety_code,
  v.label_hi, v.label_mr, v.season,
  v.maturity_min, v.maturity_max, v.yield_qtl_per_acre,
  v.released_by, v.parentage, COALESCE(v.recommended_regions,'[]'::jsonb),
  COALESCE(v.is_featured,false), true
FROM _v_seed v
JOIN public.master_companies mc ON mc.slug = v.company_slug
JOIN public.crops c              ON c.value = v.crop_value
JOIN _crop_cat cc                ON cc.crop_value = v.crop_value
ON CONFLICT (company_id, variety_code) WHERE product_type = 'seed' AND variety_code IS NOT NULL
DO NOTHING;

INSERT INTO public.master_product_variety_crops (product_id, crop_id, is_primary)
SELECT mp.id, mp.crop_id, true
FROM public.master_products mp
WHERE mp.product_type = 'seed' AND mp.crop_id IS NOT NULL
ON CONFLICT (product_id, crop_id) DO NOTHING;

DROP TABLE _v_seed;
DROP TABLE _crop_cat;
