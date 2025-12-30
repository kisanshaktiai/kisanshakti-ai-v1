/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CROP KNOWLEDGE BASE - Generic Agricultural Advice
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Provides fallback crop-specific advice when rule engine has no specific rules.
 * Used for graceful degradation - farmers always get useful advice.
 */

export interface CropAdvice {
  fertilizer: {
    mr: string;
    hi: string;
    en: string;
  };
  watering: {
    mr: string;
    hi: string;
    en: string;
  };
  general_care: {
    mr: string;
    hi: string;
    en: string;
  };
  common_problems: {
    mr: string;
    hi: string;
    en: string;
  };
}

export interface StageAdvice {
  vegetative: CropAdvice;
  flowering: CropAdvice;
  fruiting: CropAdvice;
  maturity: CropAdvice;
}

/**
 * Generic crop advice organized by crop and growth stage
 * Source: ICAR general guidelines
 */
export const CROP_KNOWLEDGE: Record<string, StageAdvice> = {
  'SUGARCANE': {
    vegetative: {
      fertilizer: {
        mr: '🌱 उसासाठी खत शिफारस:\n• युरिया: 50-60 kg/एकर (विभागून द्या)\n• DAP: 30-35 kg/एकर\n• म्युरेट ऑफ पोटॅश: 20-25 kg/एकर\n\n⏰ खत देण्याची वेळ: सकाळी किंवा संध्याकाळी, मातीत ओलावा असताना',
        hi: '🌱 गन्ने के लिए खाद सिफारिश:\n• यूरिया: 50-60 kg/एकड़ (विभाजित करें)\n• DAP: 30-35 kg/एकड़\n• म्यूरेट ऑफ पोटाश: 20-25 kg/एकड़\n\n⏰ खाद देने का समय: सुबह या शाम, मिट्टी में नमी हो',
        en: '🌱 Fertilizer for Sugarcane:\n• Urea: 50-60 kg/acre (split application)\n• DAP: 30-35 kg/acre\n• Muriate of Potash: 20-25 kg/acre\n\n⏰ Apply in morning/evening when soil is moist'
      },
      watering: {
        mr: '💧 पाणी व्यवस्थापन:\n• दर 7-10 दिवसांनी पाणी द्या\n• 30,000-35,000 लिटर/एकर\n• सकाळी किंवा संध्याकाळी पाणी द्या',
        hi: '💧 पानी प्रबंधन:\n• हर 7-10 दिन में पानी दें\n• 30,000-35,000 लीटर/एकड़\n• सुबह या शाम पानी दें',
        en: '💧 Water Management:\n• Irrigate every 7-10 days\n• 30,000-35,000 liters/acre\n• Apply in morning or evening'
      },
      general_care: {
        mr: '🌾 काळजी:\n• तण नियंत्रण करा\n• मातीची मशागत करा\n• किडींसाठी निरीक्षण करा',
        hi: '🌾 देखभाल:\n• खरपतवार नियंत्रण करें\n• मिट्टी की निराई करें\n• कीटों की निगरानी करें',
        en: '🌾 Care:\n• Control weeds\n• Maintain soil cultivation\n• Monitor for pests'
      },
      common_problems: {
        mr: '⚠️ सामान्य समस्या:\n• पांढरी माशी\n• शेंडा पोखरणारी अळी\n• तुडतुडे\n\n📸 अचूक निदानासाठी फोटो पाठवा',
        hi: '⚠️ सामान्य समस्याएं:\n• सफेद मक्खी\n• तना छेदक\n• फुदका\n\n📸 सही निदान के लिए फोटो भेजें',
        en: '⚠️ Common Problems:\n• Whitefly\n• Shoot borer\n• Pyrilla\n\n📸 Send photo for accurate diagnosis'
      }
    },
    flowering: {
      fertilizer: {
        mr: '🌱 फुलोऱ्याच्या अवस्थेत:\n• नायट्रोजन खत टाळा\n• पोटॅश खात 25-30 kg/एकर द्या\n• सूक्ष्म अन्नद्रव्ये फवारा',
        hi: '🌱 फूल अवस्था में:\n• नाइट्रोजन खाद से बचें\n• पोटाश खाद 25-30 kg/एकड़ दें\n• सूक्ष्म पोषक तत्व छिड़काव करें',
        en: '🌱 Flowering Stage:\n• Avoid nitrogen fertilizers\n• Apply potash 25-30 kg/acre\n• Spray micronutrients'
      },
      watering: {
        mr: '💧 पाणी:\n• दर 10-12 दिवसांनी पाणी\n• जास्त पाणी देणे टाळा',
        hi: '💧 पानी:\n• हर 10-12 दिन में पानी\n• अधिक पानी देने से बचें',
        en: '💧 Water:\n• Irrigate every 10-12 days\n• Avoid over-irrigation'
      },
      general_care: {
        mr: '🌾 काळजी:\n• बांधणी करा\n• पाने वाळत आहेत का पहा',
        hi: '🌾 देखभाल:\n• बांधाई करें\n• पत्तियां सूख रही हैं क्या देखें',
        en: '🌾 Care:\n• Perform propping\n• Check for leaf drying'
      },
      common_problems: {
        mr: '⚠️ या अवस्थेत:\n• रेड रॉट तपासा\n• पाने पिवळी पडत आहेत का पहा',
        hi: '⚠️ इस अवस्था में:\n• रेड रॉट जांचें\n• पत्तियां पीली हो रही हैं क्या देखें',
        en: '⚠️ In this stage:\n• Check for Red Rot\n• Monitor for yellowing leaves'
      }
    },
    fruiting: {
      fertilizer: {
        mr: '🌱 या अवस्थेत खत टाळा\n• पोटॅश फवारणी करू शकता',
        hi: '🌱 इस अवस्था में खाद से बचें\n• पोटाश छिड़काव कर सकते हैं',
        en: '🌱 Avoid fertilizers at this stage\n• Can spray potash'
      },
      watering: {
        mr: '💧 पाणी कमी करा\n• दर 12-15 दिवसांनी',
        hi: '💧 पानी कम करें\n• हर 12-15 दिन में',
        en: '💧 Reduce watering\n• Every 12-15 days'
      },
      general_care: {
        mr: '🌾 परिपक्वता निरीक्षण करा',
        hi: '🌾 परिपक्वता की निगरानी करें',
        en: '🌾 Monitor maturity'
      },
      common_problems: {
        mr: '⚠️ या अवस्थेत:\n• पोकळ ऊस तपासा\n• रोग लक्षणे पहा',
        hi: '⚠️ इस अवस्था में:\n• खोखला गन्ना जांचें\n• रोग के लक्षण देखें',
        en: '⚠️ At this stage:\n• Check for hollow sugarcane\n• Look for disease symptoms'
      }
    },
    maturity: {
      fertilizer: {
        mr: '🌱 कापणीपूर्वी खत देणे टाळा',
        hi: '🌱 कटाई से पहले खाद देने से बचें',
        en: '🌱 Avoid fertilizers before harvest'
      },
      watering: {
        mr: '💧 कापणीपूर्वी 15-20 दिवस पाणी बंद करा',
        hi: '💧 कटाई से 15-20 दिन पहले पानी बंद करें',
        en: '💧 Stop irrigation 15-20 days before harvest'
      },
      general_care: {
        mr: '🌾 कापणीची तयारी करा\n• बाजार भाव तपासा',
        hi: '🌾 कटाई की तैयारी करें\n• बाजार भाव जांचें',
        en: '🌾 Prepare for harvest\n• Check market prices'
      },
      common_problems: {
        mr: '⚠️ कापणी वेळेत करा\n• साखर उतरण्याआधी कापा',
        hi: '⚠️ समय पर कटाई करें\n• चीनी गिरने से पहले काटें',
        en: '⚠️ Harvest on time\n• Cut before sugar content drops'
      }
    }
  },
  
  'COTTON': {
    vegetative: {
      fertilizer: {
        mr: '🌱 कापूस खत शिफारस:\n• युरिया: 40-50 kg/एकर\n• DAP: 25-30 kg/एकर\n• MOP: 20-25 kg/एकर\n\n⏰ पेरणीनंतर 25-30 दिवसांनी पहिला डोस',
        hi: '🌱 कपास खाद सिफारिश:\n• यूरिया: 40-50 kg/एकड़\n• DAP: 25-30 kg/एकड़\n• MOP: 20-25 kg/एकड़\n\n⏰ बुवाई के 25-30 दिन बाद पहली खुराक',
        en: '🌱 Cotton Fertilizer:\n• Urea: 40-50 kg/acre\n• DAP: 25-30 kg/acre\n• MOP: 20-25 kg/acre\n\n⏰ First dose 25-30 days after sowing'
      },
      watering: {
        mr: '💧 पाणी:\n• दर 8-10 दिवसांनी\n• 25,000-30,000 लिटर/एकर',
        hi: '💧 पानी:\n• हर 8-10 दिन में\n• 25,000-30,000 लीटर/एकड़',
        en: '💧 Water:\n• Every 8-10 days\n• 25,000-30,000 liters/acre'
      },
      general_care: {
        mr: '🌾 काळजी:\n• तण नियंत्रण करा\n• मातीची मशागत करा',
        hi: '🌾 देखभाल:\n• खरपतवार नियंत्रण करें\n• निराई करें',
        en: '🌾 Care:\n• Control weeds\n• Maintain cultivation'
      },
      common_problems: {
        mr: '⚠️ सामान्य समस्या:\n• मावा (Aphid)\n• पांढरी माशी\n• गुलाबी बोंड अळी\n\n📸 फोटो पाठवा',
        hi: '⚠️ सामान्य समस्याएं:\n• माहू\n• सफेद मक्खी\n• गुलाबी बोलवर्म\n\n📸 फोटो भेजें',
        en: '⚠️ Common Problems:\n• Aphid\n• Whitefly\n• Pink bollworm\n\n📸 Send photo'
      }
    },
    flowering: {
      fertilizer: {
        mr: '🌱 फुलोऱ्यात:\n• युरिया 25-30 kg/एकर\n• पोटॅश 15-20 kg/एकर',
        hi: '🌱 फूल अवस्था में:\n• यूरिया 25-30 kg/एकड़\n• पोटाश 15-20 kg/एकड़',
        en: '🌱 Flowering:\n• Urea 25-30 kg/acre\n• Potash 15-20 kg/acre'
      },
      watering: {
        mr: '💧 पाणी:\n• दर 7-8 दिवसांनी\n• फुलोऱ्यात पाण्याची कमतरता टाळा',
        hi: '💧 पानी:\n• हर 7-8 दिन में\n• फूल अवस्था में पानी की कमी न होने दें',
        en: '💧 Water:\n• Every 7-8 days\n• Avoid water stress during flowering'
      },
      general_care: {
        mr: '🌾 बोंड विकासासाठी पोषण द्या',
        hi: '🌾 गूलर विकास के लिए पोषण दें',
        en: '🌾 Provide nutrition for boll development'
      },
      common_problems: {
        mr: '⚠️ गुलाबी बोंड अळीसाठी सतर्क रहा\n• फेरोमोन ट्रॅप वापरा',
        hi: '⚠️ गुलाबी बोलवर्म के लिए सतर्क रहें\n• फेरोमोन ट्रैप उपयोग करें',
        en: '⚠️ Be alert for Pink bollworm\n• Use pheromone traps'
      }
    },
    fruiting: {
      fertilizer: {
        mr: '🌱 बोंड विकासासाठी:\n• पोटॅश 20 kg/एकर\n• सूक्ष्म अन्नद्रव्ये फवारा',
        hi: '🌱 गूलर विकास के लिए:\n• पोटाश 20 kg/एकड़\n• सूक्ष्म पोषक छिड़काव',
        en: '🌱 For boll development:\n• Potash 20 kg/acre\n• Micronutrient spray'
      },
      watering: {
        mr: '💧 नियमित पाणी द्या\n• दर 10-12 दिवसांनी',
        hi: '💧 नियमित पानी दें\n• हर 10-12 दिन में',
        en: '💧 Regular irrigation\n• Every 10-12 days'
      },
      general_care: {
        mr: '🌾 बोंड फुटण्यासाठी तयारी',
        hi: '🌾 गूलर खुलने की तैयारी',
        en: '🌾 Prepare for boll opening'
      },
      common_problems: {
        mr: '⚠️ बोंड सड तपासा\n• जास्त पाणी टाळा',
        hi: '⚠️ गूलर सड़न जांचें\n• अधिक पानी से बचें',
        en: '⚠️ Check for boll rot\n• Avoid over-watering'
      }
    },
    maturity: {
      fertilizer: {
        mr: '🌱 खत देणे टाळा',
        hi: '🌱 खाद देने से बचें',
        en: '🌱 Avoid fertilizers'
      },
      watering: {
        mr: '💧 कापणीपूर्वी पाणी कमी करा',
        hi: '💧 चुनाई से पहले पानी कम करें',
        en: '💧 Reduce water before picking'
      },
      general_care: {
        mr: '🌾 वेचणीची तयारी\n• वेळेत वेचणी करा',
        hi: '🌾 चुनाई की तैयारी\n• समय पर चुनाई करें',
        en: '🌾 Prepare for picking\n• Pick on time'
      },
      common_problems: {
        mr: '⚠️ वेळेत वेचणी करा\n• पावसापूर्वी कापसू घ्या',
        hi: '⚠️ समय पर चुनाई करें\n• बारिश से पहले कपास उठाएं',
        en: '⚠️ Pick on time\n• Harvest before rain'
      }
    }
  },
  
  'SOYBEAN': {
    vegetative: {
      fertilizer: {
        mr: '🌱 सोयाबीन खत:\n• DAP: 40-50 kg/एकर (बेसल)\n• MOP: 15-20 kg/एकर\n• सल्फर: 10-12 kg/एकर\n\nनायट्रोजन जास्त देणे टाळा (शेंगा पिकांना नत्र स्थिर करण्याची क्षमता)',
        hi: '🌱 सोयाबीन खाद:\n• DAP: 40-50 kg/एकड़ (बेसल)\n• MOP: 15-20 kg/एकड़\n• सल्फर: 10-12 kg/एकड़\n\nनाइट्रोजन अधिक देने से बचें (दलहन फसल)',
        en: '🌱 Soybean Fertilizer:\n• DAP: 40-50 kg/acre (basal)\n• MOP: 15-20 kg/acre\n• Sulfur: 10-12 kg/acre\n\nAvoid excess nitrogen (legume crop fixes nitrogen)'
      },
      watering: {
        mr: '💧 सोयाबीन पाण्याला संवेदनशील\n• पाणी साचणे टाळा\n• फक्त गरज असेल तरच द्या',
        hi: '💧 सोयाबीन पानी के प्रति संवेदनशील\n• जलभराव से बचें\n• जरूरत होने पर ही दें',
        en: '💧 Soybean is sensitive to water\n• Avoid waterlogging\n• Irrigate only if needed'
      },
      general_care: {
        mr: '🌾 काळजी:\n• तण नियंत्रण\n• रायझोबियम बीजप्रक्रिया करा',
        hi: '🌾 देखभाल:\n• खरपतवार नियंत्रण\n• राइजोबियम बीजोपचार करें',
        en: '🌾 Care:\n• Weed control\n• Rhizobium seed treatment'
      },
      common_problems: {
        mr: '⚠️ सामान्य समस्या:\n• स्टेम फ्लाय\n• गर्डल बीटल\n• येलो मोझॅक',
        hi: '⚠️ सामान्य समस्याएं:\n• स्टेम फ्लाई\n• गर्डल बीटल\n• येलो मोज़ेक',
        en: '⚠️ Common Problems:\n• Stem fly\n• Girdle beetle\n• Yellow mosaic virus'
      }
    },
    flowering: {
      fertilizer: {
        mr: '🌱 फुलोऱ्यात:\n• पोटॅश फवारणी 0.5%\n• सूक्ष्म अन्नद्रव्ये',
        hi: '🌱 फूल अवस्था में:\n• पोटाश छिड़काव 0.5%\n• सूक्ष्म पोषक तत्व',
        en: '🌱 Flowering:\n• Potash spray 0.5%\n• Micronutrients'
      },
      watering: {
        mr: '💧 फुलोऱ्यात पाण्याची कमतरता टाळा\n• गरज असेल तर सिंचन करा',
        hi: '💧 फूल अवस्था में पानी की कमी न होने दें',
        en: '💧 Avoid water stress during flowering'
      },
      general_care: {
        mr: '🌾 शेंगा विकासासाठी पोषण',
        hi: '🌾 फली विकास के लिए पोषण',
        en: '🌾 Nutrition for pod development'
      },
      common_problems: {
        mr: '⚠️ शेंगा पोखरणाऱ्या अळीसाठी सतर्क',
        hi: '⚠️ फली छेदक के लिए सतर्क',
        en: '⚠️ Alert for pod borer'
      }
    },
    fruiting: {
      fertilizer: {
        mr: '🌱 खत टाळा',
        hi: '🌱 खाद से बचें',
        en: '🌱 Avoid fertilizers'
      },
      watering: {
        mr: '💧 शेंगा भरण्यासाठी ओलावा ठेवा',
        hi: '💧 फली भरने के लिए नमी रखें',
        en: '💧 Maintain moisture for pod filling'
      },
      general_care: {
        mr: '🌾 शेंगा विकास पहा',
        hi: '🌾 फली विकास देखें',
        en: '🌾 Monitor pod development'
      },
      common_problems: {
        mr: '⚠️ शेंगा फुगणे तपासा',
        hi: '⚠️ फली फूलना जांचें',
        en: '⚠️ Check pod filling'
      }
    },
    maturity: {
      fertilizer: {
        mr: '🌱 खत देणे टाळा',
        hi: '🌱 खाद देने से बचें',
        en: '🌱 Avoid fertilizers'
      },
      watering: {
        mr: '💧 कापणीपूर्वी पाणी बंद करा',
        hi: '💧 कटाई से पहले पानी बंद करें',
        en: '💧 Stop irrigation before harvest'
      },
      general_care: {
        mr: '🌾 90% पाने पिवळी झाल्यावर कापणी',
        hi: '🌾 90% पत्तियां पीली होने पर कटाई',
        en: '🌾 Harvest when 90% leaves turn yellow'
      },
      common_problems: {
        mr: '⚠️ वेळेत कापणी करा\n• पावसापूर्वी कापा',
        hi: '⚠️ समय पर कटाई करें\n• बारिश से पहले काटें',
        en: '⚠️ Harvest on time\n• Before rain'
      }
    }
  }
};

/**
 * Get fallback advice for a specific crop and stage
 */
export function getCropAdvice(
  cropCode: string,
  stage: string,
  language: 'mr' | 'hi' | 'en' = 'mr'
): string {
  const normalizedCrop = cropCode?.toUpperCase() || 'SUGARCANE';
  const normalizedStage = normalizeStage(stage);
  
  const cropData = CROP_KNOWLEDGE[normalizedCrop];
  if (!cropData) {
    // Return generic advice
    return getGenericAdvice(language);
  }
  
  const stageData = cropData[normalizedStage as keyof StageAdvice];
  if (!stageData) {
    return getGenericAdvice(language);
  }
  
  // Combine all sections
  const parts: string[] = [];
  parts.push(stageData.fertilizer[language]);
  parts.push(stageData.watering[language]);
  parts.push(stageData.general_care[language]);
  parts.push(stageData.common_problems[language]);
  
  return parts.join('\n\n');
}

/**
 * Get fertilizer-specific advice
 */
export function getFertilizerAdvice(
  cropCode: string,
  stage: string,
  language: 'mr' | 'hi' | 'en' = 'mr'
): string {
  const normalizedCrop = cropCode?.toUpperCase() || 'SUGARCANE';
  const normalizedStage = normalizeStage(stage);
  
  const cropData = CROP_KNOWLEDGE[normalizedCrop];
  if (!cropData) {
    return getGenericFertilizerAdvice(language);
  }
  
  const stageData = cropData[normalizedStage as keyof StageAdvice];
  if (!stageData) {
    return getGenericFertilizerAdvice(language);
  }
  
  return stageData.fertilizer[language];
}

/**
 * Get watering advice
 */
export function getWateringAdvice(
  cropCode: string,
  stage: string,
  language: 'mr' | 'hi' | 'en' = 'mr'
): string {
  const normalizedCrop = cropCode?.toUpperCase() || 'SUGARCANE';
  const normalizedStage = normalizeStage(stage);
  
  const cropData = CROP_KNOWLEDGE[normalizedCrop];
  if (!cropData) {
    return getGenericWateringAdvice(language);
  }
  
  const stageData = cropData[normalizedStage as keyof StageAdvice];
  if (!stageData) {
    return getGenericWateringAdvice(language);
  }
  
  return stageData.watering[language];
}

/**
 * Normalize stage string
 */
function normalizeStage(stage: string | undefined): string {
  if (!stage) return 'vegetative';
  
  const normalized = stage.toLowerCase();
  
  if (normalized.includes('veget') || normalized.includes('seedling') || normalized.includes('early')) {
    return 'vegetative';
  }
  if (normalized.includes('flower') || normalized.includes('reproductive')) {
    return 'flowering';
  }
  if (normalized.includes('fruit') || normalized.includes('boll') || normalized.includes('pod') || normalized.includes('grain')) {
    return 'fruiting';
  }
  if (normalized.includes('matur') || normalized.includes('harvest') || normalized.includes('ripe')) {
    return 'maturity';
  }
  
  return 'vegetative';
}

/**
 * Generic advice when crop not in knowledge base
 */
function getGenericAdvice(language: 'mr' | 'hi' | 'en'): string {
  const advice = {
    mr: `🌾 सामान्य शेती सल्ला:

📋 खत:
• मातीची तपासणी करा
• शिफारसीनुसार खत द्या
• विभाजित डोसमध्ये द्या

💧 पाणी:
• नियमित पाणी द्या
• पाणी साचणे टाळा
• सकाळी किंवा संध्याकाळी द्या

⚠️ अधिक माहितीसाठी:
• कृषी विभागाशी संपर्क साधा
• किंवा तुमच्या पिकाचे नाव सांगा`,
    hi: `🌾 सामान्य खेती सलाह:

📋 खाद:
• मिट्टी जांच करवाएं
• सिफारिश अनुसार खाद दें
• विभाजित खुराक में दें

💧 पानी:
• नियमित पानी दें
• जलभराव से बचें
• सुबह या शाम में दें

⚠️ अधिक जानकारी के लिए:
• कृषि विभाग से संपर्क करें
• या अपनी फसल का नाम बताएं`,
    en: `🌾 General Farming Advice:

📋 Fertilizer:
• Get soil tested
• Apply as recommended
• Use split doses

💧 Water:
• Regular irrigation
• Avoid waterlogging
• Apply in morning/evening

⚠️ For more info:
• Contact agriculture department
• Or tell me your crop name`
  };
  
  return advice[language];
}

/**
 * Generic fertilizer advice
 */
function getGenericFertilizerAdvice(language: 'mr' | 'hi' | 'en'): string {
  const advice = {
    mr: '🌱 खत शिफारस:\n• मातीची तपासणी करा\n• शिफारसीनुसार NPK द्या\n• विभाजित डोसमध्ये द्या\n\n📊 अचूक शिफारशीसाठी पिकाचे नाव आणि वय सांगा',
    hi: '🌱 खाद सिफारिश:\n• मिट्टी जांच करवाएं\n• सिफारिश अनुसार NPK दें\n• विभाजित खुराक में दें\n\n📊 सही सिफारिश के लिए फसल का नाम और उम्र बताएं',
    en: '🌱 Fertilizer Recommendation:\n• Get soil tested\n• Apply NPK as recommended\n• Use split doses\n\n📊 For accurate advice, tell me crop name and age'
  };
  
  return advice[language];
}

/**
 * Generic watering advice
 */
function getGenericWateringAdvice(language: 'mr' | 'hi' | 'en'): string {
  const advice = {
    mr: '💧 पाणी व्यवस्थापन:\n• नियमित पाणी द्या\n• पाणी साचणे टाळा\n• सकाळी किंवा संध्याकाळी द्या\n• मातीची ओलावा तपासा',
    hi: '💧 पानी प्रबंधन:\n• नियमित पानी दें\n• जलभराव से बचें\n• सुबह या शाम में दें\n• मिट्टी की नमी जांचें',
    en: '💧 Water Management:\n• Irrigate regularly\n• Avoid waterlogging\n• Apply in morning/evening\n• Check soil moisture'
  };
  
  return advice[language];
}

/**
 * Get clarifying questions when we need more info
 */
export function getClarifyingQuestions(
  language: 'mr' | 'hi' | 'en'
): string[] {
  const questions = {
    mr: [
      '🌾 तुमचे पीक कोणते आहे?',
      '📅 पिकाचे वय किती दिवस?',
      '📸 समस्येचा फोटो पाठवू शकता का?',
      '💧 शेवटचे पाणी कधी दिले?'
    ],
    hi: [
      '🌾 आपकी फसल कौन सी है?',
      '📅 फसल की उम्र कितने दिन?',
      '📸 क्या समस्या का फोटो भेज सकते हैं?',
      '💧 आखिरी बार पानी कब दिया?'
    ],
    en: [
      '🌾 What is your crop?',
      '📅 How old is your crop (days)?',
      '📸 Can you send a photo of the problem?',
      '💧 When did you last irrigate?'
    ]
  };
  
  return questions[language];
}
