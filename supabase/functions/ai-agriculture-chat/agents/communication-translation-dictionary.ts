/**
 * ═══════════════════════════════════════════════════════════════════════════
 * COMMUNICATION TRANSLATION DICTIONARY v1.0
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Translation dictionary for symbolic codes to farmer-friendly multilingual text
 * Supports Marathi (mr), Hindi (hi), and English (en)
 */

export type SupportedLanguage = 'mr' | 'hi' | 'en';

export interface TrilingualText {
  mr: string;
  hi: string;
  en: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// CAUSE TRANSLATIONS (Symbolic → Farmer Language)
// ═══════════════════════════════════════════════════════════════════════════

export const CAUSE_TRANSLATIONS: Record<string, TrilingualText> = {
  // Nutrient Deficiencies
  'NITROGEN_DEFICIENCY': {
    mr: 'नायट्रोजनची कमतरता - पाने पिवळी पडली आहेत',
    hi: 'नाइट्रोजन की कमी - पत्तियां पीली हो गई हैं',
    en: 'Nitrogen deficiency - Leaves have turned yellow'
  },
  'PHOSPHORUS_DEFICIENCY': {
    mr: 'स्फुरदाची कमतरता - जुनी पाने जांभळी झाली आहेत',
    hi: 'फास्फोरस की कमी - पुरानी पत्तियां बैंगनी हो गई हैं',
    en: 'Phosphorus deficiency - Older leaves turned purple'
  },
  'POTASSIUM_DEFICIENCY': {
    mr: 'पालाश कमतरता - पानांच्या काठावर जळजळ',
    hi: 'पोटाशियम की कमी - पत्तियों के किनारे झुलसे हुए',
    en: 'Potassium deficiency - Leaf edges scorched'
  },
  'ZINC_DEFICIENCY': {
    mr: 'जस्त कमतरता - पानांवर पांढरे पट्टे',
    hi: 'जिंक की कमी - पत्तियों पर सफेद धारियां',
    en: 'Zinc deficiency - White stripes on leaves'
  },
  'IRON_DEFICIENCY': {
    mr: 'लोह कमतरता - नवीन पाने पिवळी',
    hi: 'आयरन की कमी - नई पत्तियां पीली',
    en: 'Iron deficiency - New leaves yellow'
  },
  'CALCIUM_DEFICIENCY': {
    mr: 'कॅल्शियम कमतरता - फळांवर काळे डाग',
    hi: 'कैल्शियम की कमी - फलों पर काले धब्बे',
    en: 'Calcium deficiency - Black spots on fruits (BER)'
  },
  'MAGNESIUM_DEFICIENCY': {
    mr: 'मॅग्नेशियम कमतरता - पानांच्या शिरांमध्ये पिवळे',
    hi: 'मैग्नीशियम की कमी - पत्तियों की नसों के बीच पीलापन',
    en: 'Magnesium deficiency - Yellowing between leaf veins'
  },
  
  // Pests
  'PEST_WHITEFLY': {
    mr: 'पांढरी माशी चा प्रादुर्भाव - पानांच्या खालच्या बाजूला लहान पांढरे किडे',
    hi: 'सफेद मक्खी का प्रकोप - पत्तियों के नीचे छोटे सफेद कीड़े',
    en: 'Whitefly infestation - Small white insects under leaves'
  },
  'PEST_APHID': {
    mr: 'माव्याचा प्रादुर्भाव - हिरव्या/काळ्या रंगाचे लहान किडे',
    hi: 'एफिड का प्रकोप - हरे/काले रंग के छोटे कीड़े',
    en: 'Aphid infestation - Small green/black insects'
  },
  'PEST_THRIPS': {
    mr: 'थ्रिप्स चा प्रादुर्भाव - पानांवर चांदी सारखे डाग',
    hi: 'थ्रिप्स का प्रकोप - पत्तियों पर चांदी जैसे धब्बे',
    en: 'Thrips infestation - Silvery patches on leaves'
  },
  'PEST_MITES': {
    mr: 'माइट्स चा प्रादुर्भाव - पानांवर लालसर जाळे',
    hi: 'माइट्स का प्रकोप - पत्तियों पर लाल जाले',
    en: 'Mite infestation - Reddish webs on leaves'
  },
  'PEST_CATERPILLAR': {
    mr: 'सुरवंटाचा प्रादुर्भाव - पाने खाल्ली',
    hi: 'कैटरपिलर का प्रकोप - पत्तियां कटी हुई',
    en: 'Caterpillar infestation - Eaten leaves'
  },
  'PEST_BOLLWORM': {
    mr: 'बोंडअळीचा प्रादुर्भाव - फुले/बोंडात छिद्र',
    hi: 'बॉलवर्म का प्रकोप - फूल/बॉल में छेद',
    en: 'Bollworm infestation - Holes in flowers/bolls'
  },
  'PEST_STEMFLY': {
    mr: 'शेंडा अळीचा प्रादुर्भाव - मधली सुरळी वाळली',
    hi: 'स्टेमफ्लाई का प्रकोप - बीच की पत्ती सूखी',
    en: 'Stemfly/shootfly infestation - Dead heart symptom'
  },
  'PEST_TUTA_ABSOLUTA': {
    mr: 'टुटा अबसोल्युटा - पानात वेडीवाकडी रेषा',
    hi: 'टूटा अब्सोलूटा - पत्तियों में टेढ़ी-मेढ़ी रेखाएं',
    en: 'Tuta absoluta - Serpentine mines in leaves'
  },
  'PEST_FRUIT_FLY': {
    mr: 'फळमाशीचा प्रादुर्भाव - फळांवर टोचने',
    hi: 'फ्रूट फ्लाई का प्रकोप - फलों पर छेद',
    en: 'Fruit fly infestation - Punctures on fruits'
  },
  'PEST_MEALYBUG': {
    mr: 'मिलीबग चा प्रादुर्भाव - पांढरी मेणासारखी थर',
    hi: 'मिलीबग का प्रकोप - सफेद मोम जैसी परत',
    en: 'Mealybug infestation - White waxy coating'
  },
  
  // Diseases
  'DISEASE_POWDERY_MILDEW': {
    mr: 'भुरी रोग - पानांवर पांढरी पावडरसारखी थर',
    hi: 'पाउडरी मिल्ड्यू रोग - पत्तियों पर सफेद पाउडर जैसी परत',
    en: 'Powdery mildew disease - White powdery coating on leaves'
  },
  'DISEASE_DOWNY_MILDEW': {
    mr: 'डाऊनी मिल्ड्यू - पानांच्या खाली राखाडी बुरशी',
    hi: 'डाउनी मिल्ड्यू - पत्तियों के नीचे ग्रे फंगस',
    en: 'Downy mildew - Gray fungus under leaves'
  },
  'DISEASE_LATE_BLIGHT': {
    mr: 'लेट ब्लाइट - पानांवर पाणीदार डाग',
    hi: 'लेट ब्लाइट - पत्तियों पर पानीदार धब्बे',
    en: 'Late blight - Water-soaked spots on leaves'
  },
  'DISEASE_EARLY_BLIGHT': {
    mr: 'अर्ली ब्लाइट - पानांवर टार्गेट बोर्ड सारखे गोल डाग',
    hi: 'अर्ली ब्लाइट - पत्तियों पर टार्गेट बोर्ड जैसे गोल धब्बे',
    en: 'Early blight - Target board pattern spots'
  },
  'DISEASE_ANTHRACNOSE': {
    mr: 'ऍन्थ्राक्नोझ - फळांवर खोल काळे डाग',
    hi: 'एंथ्रेक्नोज - फलों पर गहरे काले धब्बे',
    en: 'Anthracnose - Deep black spots on fruits'
  },
  'DISEASE_BACTERIAL_WILT': {
    mr: 'बॅक्टेरियल विल्ट - झाड अचानक सुकले',
    hi: 'बैक्टीरियल विल्ट - पौधा अचानक मुरझाया',
    en: 'Bacterial wilt - Sudden plant wilting'
  },
  'DISEASE_FUSARIUM_WILT': {
    mr: 'फ्युसेरियम विल्ट - पानांना एकतर्फी करपा',
    hi: 'फ्यूसेरियम विल्ट - पत्तियों का एक तरफ से मुरझाना',
    en: 'Fusarium wilt - One-sided leaf wilting'
  },
  'DISEASE_LEAF_CURL': {
    mr: 'पानगुंडाळी रोग - पाने मुडली',
    hi: 'लीफ कर्ल रोग - पत्तियां मुड़ गई',
    en: 'Leaf curl disease - Curled leaves'
  },
  'DISEASE_MOSAIC': {
    mr: 'मोझेक विषाणू - पानांवर हिरवे-पिवळे डाग',
    hi: 'मोजेक वायरस - पत्तियों पर हरे-पीले धब्बे',
    en: 'Mosaic virus - Green-yellow mottling on leaves'
  },
  
  // Water & Irrigation
  'WATER_STRESS': {
    mr: 'पाण्याची कमतरता - पाने कोमेजलेली, माती कोरडी',
    hi: 'पानी की कमी - पत्तियां मुरझाई, मिट्टी सूखी',
    en: 'Water stress - Leaves wilted, soil dry'
  },
  'WATER_LOGGING': {
    mr: 'पाण्याची साठवण - मुळे कुजलेली',
    hi: 'जलभराव - जड़ें सड़ गई',
    en: 'Waterlogging - Root rot'
  },
  
  // General
  'UNKNOWN': {
    mr: 'समस्या ओळखली जात आहे',
    hi: 'समस्या की पहचान हो रही है',
    en: 'Problem being identified'
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// ACTION TRANSLATIONS
// ═══════════════════════════════════════════════════════════════════════════

export const ACTION_TRANSLATIONS: Record<string, TrilingualText> = {
  'APPLY_PESTICIDE': {
    mr: 'किडनाशक औषध फवारणी',
    hi: 'कीटनाशक दवा का छिड़काव',
    en: 'Apply pesticide spray'
  },
  'APPLY_NEEM_OIL': {
    mr: 'कडुनिंबाचे तेल फवारा',
    hi: 'नीम तेल का छिड़काव करें',
    en: 'Spray neem oil'
  },
  'APPLY_UREA': {
    mr: 'युरिया खत टाका',
    hi: 'यूरिया खाद डालें',
    en: 'Apply urea fertilizer'
  },
  'APPLY_DAP': {
    mr: 'डीएपी खत टाका',
    hi: 'डीएपी खाद डालें',
    en: 'Apply DAP fertilizer'
  },
  'APPLY_POTASH': {
    mr: 'पालाश खत टाका',
    hi: 'पोटाश खाद डालें',
    en: 'Apply potash fertilizer'
  },
  'APPLY_FUNGICIDE': {
    mr: 'बुरशीनाशक औषध फवारा',
    hi: 'फफूंदनाशक दवा का छिड़काव',
    en: 'Apply fungicide spray'
  },
  'IRRIGATE': {
    mr: 'पाणी द्या',
    hi: 'सिंचाई करें',
    en: 'Irrigate the field'
  },
  'MONITOR': {
    mr: 'पिकाचे निरीक्षण करा',
    hi: 'फसल की निगरानी करें',
    en: 'Monitor the crop'
  },
  'SPRAY_BIOPESTICIDE': {
    mr: 'जैविक किडनाशक फवारा',
    hi: 'जैविक कीटनाशक छिड़कें',
    en: 'Spray biopesticide'
  },
  'SPRAY_BOTANICAL': {
    mr: 'वनस्पती आधारित औषध फवारा',
    hi: 'वानस्पतिक दवा छिड़कें',
    en: 'Spray botanical pesticide'
  },
  'SPRAY_CHEMICAL': {
    mr: 'रासायनिक औषध फवारा',
    hi: 'रासायनिक दवा छिड़कें',
    en: 'Spray chemical pesticide'
  },
  'CULTURAL_PRACTICE': {
    mr: 'पीक पद्धत बदला',
    hi: 'खेती की विधि बदलें',
    en: 'Change cultural practice'
  },
  'MECHANICAL_CONTROL': {
    mr: 'यांत्रिक नियंत्रण करा',
    hi: 'यांत्रिक नियंत्रण करें',
    en: 'Apply mechanical control'
  },
  'BIOLOGICAL_RELEASE': {
    mr: 'जैविक शत्रू सोडा',
    hi: 'जैविक शत्रु छोड़ें',
    en: 'Release biological agents'
  },
  'FERTILIZER_APPLICATION': {
    mr: 'खत द्या',
    hi: 'खाद दें',
    en: 'Apply fertilizer'
  },
  'NO_ACTION': {
    mr: 'कृती आवश्यक नाही',
    hi: 'कार्रवाई आवश्यक नहीं',
    en: 'No action required'
  },
  'MONITOR_ONLY': {
    mr: 'फक्त निरीक्षण करा',
    hi: 'केवल निगरानी करें',
    en: 'Monitor only'
  },
  'ESCALATE_TO_EXPERT': {
    mr: 'तज्ञाचा सल्ला घ्या',
    hi: 'विशेषज्ञ से सलाह लें',
    en: 'Consult an expert'
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// PRODUCT NAME TRANSLATIONS
// ═══════════════════════════════════════════════════════════════════════════

export const PRODUCT_TRANSLATIONS: Record<string, TrilingualText> = {
  // Insecticides
  'Imidacloprid 17.8 SL': {
    mr: 'इमिडाक्लोप्रिड (कॉन्फिडॉर)',
    hi: 'इमिडाक्लोप्रिड (कॉन्फिडोर)',
    en: 'Imidacloprid (Confidor)'
  },
  'Thiamethoxam 25 WG': {
    mr: 'थायमिथॉक्सॅम (ॲक्टारा)',
    hi: 'थायमेथोक्सम (एक्टारा)',
    en: 'Thiamethoxam (Actara)'
  },
  'Spinosad 45 SC': {
    mr: 'स्पिनोसॅड (ट्रेसर)',
    hi: 'स्पिनोसैड (ट्रेसर)',
    en: 'Spinosad (Tracer)'
  },
  'Chlorantraniliprole 18.5 SC': {
    mr: 'क्लोरॅन्ट्रॅनिलिप्रोल (कोराजेन)',
    hi: 'क्लोरेंट्रानिलीप्रोल (कोराजेन)',
    en: 'Chlorantraniliprole (Coragen)'
  },
  'Emamectin Benzoate 5 SG': {
    mr: 'इमामेक्टिन बेंझोएट (प्रोक्लेम)',
    hi: 'इमामेक्टिन बेंजोएट (प्रोक्लेम)',
    en: 'Emamectin Benzoate (Proclaim)'
  },
  
  // Fungicides
  'Mancozeb 75% WP': {
    mr: 'मॅन्कोझेब (डायथेन M-45)',
    hi: 'मैंकोजेब (डाइथेन M-45)',
    en: 'Mancozeb (Dithane M-45)'
  },
  'Carbendazim 50 WP': {
    mr: 'कार्बेन्डॅझिम (बाविस्टिन)',
    hi: 'कार्बेन्डाजिम (बाविस्टिन)',
    en: 'Carbendazim (Bavistin)'
  },
  'Copper Oxychloride 50 WP': {
    mr: 'कॉपर ऑक्सीक्लोराइड (ब्लिटॉक्स)',
    hi: 'कॉपर ऑक्सीक्लोराइड (ब्लिटॉक्स)',
    en: 'Copper Oxychloride (Blitox)'
  },
  'Azoxystrobin 23 SC': {
    mr: 'ॲझॉक्सिस्ट्रॉबिन (अमिस्टार)',
    hi: 'एजोक्सीस्ट्रोबिन (अमिस्टर)',
    en: 'Azoxystrobin (Amistar)'
  },
  
  // Botanicals
  'Neem Oil 1500 ppm': {
    mr: 'कडुनिंबाचे तेल',
    hi: 'नीम तेल',
    en: 'Neem Oil'
  },
  'Neem Oil 10000 ppm': {
    mr: 'कडुनिंबाचे तेल (गाढ)',
    hi: 'नीम तेल (सांद्र)',
    en: 'Neem Oil (Concentrated)'
  },
  
  // Biologicals
  'Trichoderma viride': {
    mr: 'ट्रायकोडर्मा',
    hi: 'ट्राइकोडर्मा',
    en: 'Trichoderma'
  },
  'Pseudomonas fluorescens': {
    mr: 'स्यूडोमोनास',
    hi: 'स्यूडोमोनास',
    en: 'Pseudomonas'
  },
  'Beauveria bassiana': {
    mr: 'ब्युवेरिया बेसियाना',
    hi: 'ब्यूवेरिया बेसियाना',
    en: 'Beauveria bassiana'
  },
  'Verticillium lecanii': {
    mr: 'व्हर्टिसिलियम लेकानी',
    hi: 'वर्टिसिलियम लेकानी',
    en: 'Verticillium lecanii'
  },
  'Metarhizium anisopliae': {
    mr: 'मेटाऱ्हिझियम',
    hi: 'मेटाराइजियम',
    en: 'Metarhizium'
  },
  'Bacillus thuringiensis (Bt)': {
    mr: 'बीटी (बॅसिलस थुरिंजिएन्सिस)',
    hi: 'बीटी (बैसिलस थुरिंजिएंसिस)',
    en: 'Bt (Bacillus thuringiensis)'
  },
  
  // Fertilizers
  'Urea 46% N': {
    mr: 'युरिया खत',
    hi: 'यूरिया खाद',
    en: 'Urea fertilizer'
  },
  'DAP 18-46-0': {
    mr: 'डायअमोनियम फॉस्फेट',
    hi: 'डायअमोनियम फॉस्फेट',
    en: 'Di-ammonium Phosphate'
  },
  'MOP 0-0-60': {
    mr: 'म्युरिएट ऑफ पोटॅश',
    hi: 'म्यूरिएट ऑफ पोटाश',
    en: 'Muriate of Potash'
  },
  '19:19:19': {
    mr: '19:19:19 खत',
    hi: '19:19:19 खाद',
    en: '19:19:19 fertilizer'
  },
  'Zinc Sulphate': {
    mr: 'झिंक सल्फेट',
    hi: 'जिंक सल्फेट',
    en: 'Zinc Sulphate'
  },
  'Ferrous Sulphate': {
    mr: 'फेरस सल्फेट',
    hi: 'फेरस सल्फेट',
    en: 'Ferrous Sulphate'
  },
  'Calcium Nitrate': {
    mr: 'कॅल्शियम नायट्रेट',
    hi: 'कैल्शियम नाइट्रेट',
    en: 'Calcium Nitrate'
  },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // BIOCONTROL AGENTS - CRITICAL FOR FARMER-FRIENDLY NAMES
  // ═══════════════════════════════════════════════════════════════════════════
  'Trichogramma chilonis': {
    mr: 'ट्रायकोग्रामा कार्ड (अंडी परजीवी) - 50,000/एकर जैविक कीटकनाशक',
    hi: 'ट्राइकोग्रामा कार्ड (अंडा परजीवी) - 50,000/एकड़ जैविक कीटनाशक',
    en: 'Trichogramma cards (Egg parasitoid) - 50,000/acre biocontrol'
  },
  'Cotesia flavipes': {
    mr: 'कोटेसिया फ्लेविपेस (अळी परजीवी) - 5,000 कोष/एकर',
    hi: 'कोटेसिया फ्लेविप्स (लार्वा परजीवी) - 5,000 कोकून/एकड़',
    en: 'Cotesia flavipes (Larval parasitoid) - 5,000 cocoons/acre'
  },
  'Neem Oil 1500 ppm': {
    mr: 'कडुनिंबाचे तेल - 5 मिली/लिटर पाण्यात मिसळा',
    hi: 'नीम तेल - 5 मिली/लीटर पानी में मिलाएं',
    en: 'Neem Oil - Mix 5ml per liter of water'
  },
  'Chlorantraniliprole 18.5 SC': {
    mr: 'कोराजेन (क्लोरॅन्ट्रानिलिप्रोल) - 0.4 मिली/लिटर',
    hi: 'कोराजेन (क्लोरेंट्रानिलीप्रोल) - 0.4 मिली/लीटर',
    en: 'Coragen (Chlorantraniliprole) - 0.4 ml/L'
  },
  'Fipronil 5 SC': {
    mr: 'फिप्रोनिल (रीजेंट) - 1.5 मिली/लिटर',
    hi: 'फिप्रोनिल (रीजेंट) - 1.5 मिली/लीटर',
    en: 'Fipronil (Regent) - 1.5 ml/L'
  },
  'NPV': {
    mr: 'न्यूक्लिओपॉलिहेड्रोसिस विषाणू (जैविक कीटकनाशक)',
    hi: 'न्यूक्लियोपॉलीहेड्रोसिस वायरस (जैविक कीटनाशक)',
    en: 'Nuclear Polyhedrosis Virus (Biopesticide)'
  },
  'Neem cake': {
    mr: 'निंबोळी पेंड - 250 किलो/एकर',
    hi: 'नीम की खली - 250 किलो/एकड़',
    en: 'Neem cake - 250 kg/acre'
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// APPLICATION METHOD TRANSLATIONS
// ═══════════════════════════════════════════════════════════════════════════

export const METHOD_TRANSLATIONS: Record<string, TrilingualText> = {
  'FOLIAR_SPRAY': {
    mr: 'पानांवर फवारणी',
    hi: 'पत्तियों पर छिड़काव',
    en: 'Foliar spray'
  },
  'SOIL_APPLICATION': {
    mr: 'जमिनीत टाकणे',
    hi: 'मिट्टी में डालना',
    en: 'Soil application'
  },
  'SOIL_DRENCH': {
    mr: 'मुळाला ओतणे',
    hi: 'जड़ों में डालना',
    en: 'Soil drench at root zone'
  },
  'DRIP_IRRIGATION': {
    mr: 'थेंब सिंचन',
    hi: 'ड्रिप सिंचाई',
    en: 'Drip irrigation'
  },
  'FERTIGATION': {
    mr: 'ड्रिप द्वारे खत',
    hi: 'ड्रिप द्वारा खाद',
    en: 'Fertigation'
  },
  'SEED_TREATMENT': {
    mr: 'बीजप्रक्रिया',
    hi: 'बीज उपचार',
    en: 'Seed treatment'
  },
  'BASAL_APPLICATION': {
    mr: 'पेरणीवेळी जमिनीत',
    hi: 'बुवाई के समय मिट्टी में',
    en: 'Basal application'
  },
  'TOP_DRESSING': {
    mr: 'झाडांच्या बुंध्यालगत',
    hi: 'पौधों के पास',
    en: 'Top dressing'
  },
  'HAND_PICKING': {
    mr: 'हाताने वेचणे',
    hi: 'हाथ से चुनना',
    en: 'Hand picking'
  },
  'TRAP_INSTALLATION': {
    mr: 'सापळे लावणे',
    hi: 'जाल लगाना',
    en: 'Install traps'
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// URGENCY LEVEL TRANSLATIONS
// ═══════════════════════════════════════════════════════════════════════════

export const URGENCY_TRANSLATIONS: Record<string, TrilingualText> = {
  'IMMEDIATE': {
    mr: '⚠️ आत्ताच करा',
    hi: '⚠️ तुरंत करें',
    en: '⚠️ Do immediately'
  },
  'WITHIN_24H': {
    mr: '📅 आजच करा',
    hi: '📅 आज ही करें',
    en: '📅 Do today'
  },
  'TODAY': {
    mr: '📅 आजच करा',
    hi: '📅 आज ही करें',
    en: '📅 Do today'
  },
  'WITHIN_48H': {
    mr: '⏰ 2 दिवसांत करा',
    hi: '⏰ 2 दिन में करें',
    en: '⏰ Do within 2 days'
  },
  'WITHIN_WEEK': {
    mr: '📆 या आठवड्यात करा',
    hi: '📆 इस सप्ताह करें',
    en: '📆 Do this week'
  },
  'THIS_WEEK': {
    mr: '📆 या आठवड्यात करा',
    hi: '📆 इस सप्ताह करें',
    en: '📆 Do this week'
  },
  'NON_URGENT': {
    mr: '✅ जेव्हा वेळ मिळेल',
    hi: '✅ जब समय मिले',
    en: '✅ When convenient'
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// SAFETY GEAR TRANSLATIONS
// ═══════════════════════════════════════════════════════════════════════════

export const SAFETY_GEAR_TRANSLATIONS: Record<string, TrilingualText> = {
  'GLOVES': {
    mr: 'हातमोजे घाला',
    hi: 'दस्ताने पहनें',
    en: 'Wear gloves'
  },
  'MASK': {
    mr: 'मुखपट्टी घाला',
    hi: 'मास्क पहनें',
    en: 'Wear mask'
  },
  'FULL_PPE': {
    mr: 'संपूर्ण संरक्षक कपडे घाला',
    hi: 'पूरे सुरक्षा कपड़े पहनें',
    en: 'Wear full protective gear'
  },
  'GOGGLES': {
    mr: 'डोळ्यांचे चष्मे घाला',
    hi: 'आंखों का चश्मा पहनें',
    en: 'Wear safety goggles'
  },
  'FULL_SLEEVES': {
    mr: 'पूर्ण बाह्यांचा शर्ट',
    hi: 'पूरी बांह की शर्ट',
    en: 'Full-sleeved shirt'
  },
  'BOOTS': {
    mr: 'बूट घाला',
    hi: 'जूते पहनें',
    en: 'Wear boots'
  },
  'APRON': {
    mr: 'एप्रन घाला',
    hi: 'एप्रन पहनें',
    en: 'Wear apron'
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Translate any text using a dictionary
 */
export function translateText(
  key: string,
  dictionary: Record<string, TrilingualText>,
  lang: SupportedLanguage
): string {
  const entry = dictionary[key];
  if (entry) {
    return entry[lang];
  }
  // Fallback: return key with basic formatting
  return key.replace(/_/g, ' ').toLowerCase();
}

/**
 * Get product name with local translation
 */
export function getProductName(
  productName: string,
  lang: SupportedLanguage
): string {
  // First check exact match
  if (PRODUCT_TRANSLATIONS[productName]) {
    return PRODUCT_TRANSLATIONS[productName][lang];
  }
  
  // Try partial match
  for (const [key, value] of Object.entries(PRODUCT_TRANSLATIONS)) {
    if (productName.toLowerCase().includes(key.toLowerCase().split(' ')[0])) {
      return value[lang];
    }
  }
  
  // Return original if no translation found
  return productName;
}

/**
 * Get cause translation with fallback
 */
export function getCauseTranslation(
  causeCode: string,
  lang: SupportedLanguage
): string {
  // Normalize the cause code
  const normalizedCode = causeCode.toUpperCase().replace(/-/g, '_');
  
  // Check direct match
  if (CAUSE_TRANSLATIONS[normalizedCode]) {
    return CAUSE_TRANSLATIONS[normalizedCode][lang];
  }
  
  // Check for partial match
  for (const [key, value] of Object.entries(CAUSE_TRANSLATIONS)) {
    if (normalizedCode.includes(key) || key.includes(normalizedCode)) {
      return value[lang];
    }
  }
  
  // Generate a readable fallback
  const readable = causeCode.replace(/_/g, ' ').replace(/-/g, ' ').toLowerCase();
  return readable.charAt(0).toUpperCase() + readable.slice(1);
}

/**
 * Get action translation with fallback
 */
export function getActionTranslation(
  actionType: string,
  lang: SupportedLanguage
): string {
  const normalizedAction = actionType.toUpperCase().replace(/-/g, '_');
  
  if (ACTION_TRANSLATIONS[normalizedAction]) {
    return ACTION_TRANSLATIONS[normalizedAction][lang];
  }
  
  // Generate a readable fallback
  const readable = actionType.replace(/_/g, ' ').toLowerCase();
  return readable.charAt(0).toUpperCase() + readable.slice(1);
}

/**
 * Get method translation
 */
export function getMethodTranslation(
  method: string,
  lang: SupportedLanguage
): string {
  const normalizedMethod = method.toUpperCase().replace(/-/g, '_');
  
  if (METHOD_TRANSLATIONS[normalizedMethod]) {
    return METHOD_TRANSLATIONS[normalizedMethod][lang];
  }
  
  return method;
}

/**
 * Get urgency translation
 */
export function getUrgencyTranslation(
  urgency: string,
  lang: SupportedLanguage
): string {
  const normalizedUrgency = urgency.toUpperCase().replace(/-/g, '_');
  
  if (URGENCY_TRANSLATIONS[normalizedUrgency]) {
    return URGENCY_TRANSLATIONS[normalizedUrgency][lang];
  }
  
  return urgency;
}

/**
 * Get safety gear translation
 */
export function getSafetyGearTranslation(
  gear: string,
  lang: SupportedLanguage
): string {
  const normalizedGear = gear.toUpperCase().replace(/-/g, '_');
  
  if (SAFETY_GEAR_TRANSLATIONS[normalizedGear]) {
    return SAFETY_GEAR_TRANSLATIONS[normalizedGear][lang];
  }
  
  return gear;
}
