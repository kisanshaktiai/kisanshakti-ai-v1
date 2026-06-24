/**
 * Rural Language Dictionary for AI Crop Schedule
 * Uses simple village farming terminology instead of textbook language
 */

export const ruralLanguageGuide: Record<string, Record<string, string>> = {
  hi: {
    // Farming Actions
    fertilizer: 'खाद डालना',
    irrigation: 'पानी देना / सिंचाई',
    pesticide: 'दवाई छिड़कना',
    weeding: 'खरपतवार निकालना / गुड़ाई',
    sowing: 'बुवाई / बिजाई',
    harvest: 'कटाई / कटनी',
    transplant: 'रोपाई',
    land_prep: 'खेत तैयारी / जुताई',
    
    // Precautions
    precaution: 'ध्यान रखें',
    warning: 'सावधान',
    important: 'जरूरी बात',
    
    // Weather
    rain: 'बारिश',
    hot: 'गर्मी',
    cold: 'ठंड',
    humidity: 'नमी',
    
    // Money
    approximately: 'लगभग',
    cost: 'खर्चा',
    profit: 'मुनाफा',
    rupees: 'रुपये',
    
    // Common terms
    seedling: 'पौधा',
    seeds: 'बीज',
    manure: 'गोबर खाद',
    urea: 'यूरिया',
    dap: 'डीएपी',
    
    // Pest/Disease
    pest: 'कीड़ा',
    disease: 'बीमारी / रोग',
    fungus: 'फफूंद',
    insect: 'कीट',
    worm: 'इल्ली / सुंडी',
    
    // Instructions
    morning: 'सुबह',
    evening: 'शाम',
    before_rain: 'बारिश से पहले',
    after_rain: 'बारिश के बाद',
  },
  
  mr: {
    // Farming Actions
    fertilizer: 'खत घालणे',
    irrigation: 'पाणी देणे',
    pesticide: 'औषध फवारणी',
    weeding: 'तण काढणे / निंदणी',
    sowing: 'पेरणी',
    harvest: 'कापणी',
    transplant: 'लागवड',
    land_prep: 'शेत तयारी / नांगरणी',
    
    // Precautions
    precaution: 'काळजी घ्या',
    warning: 'सावधान',
    important: 'महत्त्वाची गोष्ट',
    
    // Weather
    rain: 'पाऊस',
    hot: 'उष्णता',
    cold: 'थंडी',
    humidity: 'दमटपणा',
    
    // Money
    approximately: 'अंदाजे',
    cost: 'खर्च',
    profit: 'नफा',
    rupees: 'रुपये',
    
    // Common terms
    seedling: 'रोप',
    seeds: 'बियाणे',
    manure: 'शेणखत',
    urea: 'युरिया',
    dap: 'डीएपी',
    
    // Pest/Disease
    pest: 'किड',
    disease: 'रोग',
    fungus: 'बुरशी',
    insect: 'कीटक',
    worm: 'अळी',
    
    // Instructions
    morning: 'सकाळी',
    evening: 'संध्याकाळी',
    before_rain: 'पावसापूर्वी',
    after_rain: 'पावसानंतर',
  },
  
  pa: {
    fertilizer: 'ਖਾਦ ਪਾਉਣੀ',
    irrigation: 'ਪਾਣੀ ਲਾਉਣਾ',
    pesticide: 'ਦਵਾਈ ਛਿੜਕਾਅ',
    weeding: 'ਨਦੀਨ ਕੱਢਣਾ',
    sowing: 'ਬਿਜਾਈ',
    harvest: 'ਕਟਾਈ',
    approximately: 'ਲਗਭਗ',
    precaution: 'ਧਿਆਨ ਰੱਖੋ',
    rupees: 'ਰੁਪਏ',
  },
  
  ta: {
    fertilizer: 'உரமிடுதல்',
    irrigation: 'நீர் பாய்ச்சுதல்',
    pesticide: 'பூச்சிக்கொல்லி தெளித்தல்',
    weeding: 'களை எடுத்தல்',
    sowing: 'விதைப்பு',
    harvest: 'அறுவடை',
    approximately: 'தோராயமாக',
    precaution: 'கவனமாக இருங்கள்',
    rupees: 'ரூபாய்',
  },
  
  te: {
    fertilizer: 'ఎరువులు వేయడం',
    irrigation: 'నీరు పెట్టడం',
    pesticide: 'మందు చల్లడం',
    weeding: 'కలుపు తీయడం',
    sowing: 'విత్తడం',
    harvest: 'పంట కోత',
    approximately: 'సుమారుగా',
    precaution: 'జాగ్రత్త',
    rupees: 'రూపాయలు',
  },
  
  en: {
    fertilizer: 'Apply fertilizer',
    irrigation: 'Water the crop',
    pesticide: 'Spray pesticide',
    weeding: 'Remove weeds',
    sowing: 'Sow seeds',
    harvest: 'Harvest crop',
    approximately: 'Approximately',
    precaution: 'Take care',
    rupees: 'Rupees',
  }
};

/**
 * ICAR Regional Research Guidelines Reference
 */
export const icarGuidelines: Record<string, any> = {
  // Wheat
  'Wheat': {
    icar_reference: 'ICAR-IIWBR Karnal Bulletin 2024',
    recommended_varieties: ['HD 3226', 'HD 3086', 'PBW 725'],
    seed_rate_kg_ha: '100-125',
    sowing_period: 'Oct 25 - Nov 20',
    common_pests: ['Aphids (माहू)', 'Termites (दीमक)', 'Army worm (सैनिक सुंडी)'],
    common_diseases: ['Yellow Rust (पीला रतुआ)', 'Karnal Bunt (करनाल बंट)', 'Loose Smut (अनावृत कंड)'],
    climate_alerts: {
      high_humidity: 'Yellow rust risk increases when humidity > 80%',
      late_rain: 'Heavy rain at maturity causes grain discoloration',
      high_temp: 'Above 35°C causes shriveled grains'
    }
  },
  
  // Rice
  'Rice': {
    icar_reference: 'ICAR-CRRI Cuttack Guidelines 2024',
    recommended_varieties: ['Pusa Basmati 1509', 'Swarna', 'Pusa 44'],
    seed_rate_kg_ha: '20-25 (transplant) / 80-100 (direct)',
    sowing_period: 'June-July (Kharif)',
    common_pests: ['Stem Borer (तना छेदक)', 'BPH (भूरा फुदका)', 'Leaf folder (पत्ती लपेटक)'],
    common_diseases: ['Blast (ब्लास्ट)', 'Sheath Blight (शीथ ब्लाइट)', 'Bacterial Leaf Blight'],
    climate_alerts: {
      continuous_rain: 'Blast disease spreads rapidly in continuous cloudy weather',
      high_humidity: 'Sheath blight risk when humidity > 85%',
      drought: 'Water stress at flowering causes empty grains'
    }
  },
  
  // Cotton
  'Cotton': {
    icar_reference: 'ICAR-CICR Nagpur Bulletin 2024',
    recommended_varieties: ['Bt Cotton Hybrids', 'Suraj', 'Vikram'],
    seed_rate_kg_ha: '2.5-3.5 (packets/acre)',
    sowing_period: 'May-June',
    common_pests: ['Bollworm (बॉलवर्म)', 'Whitefly (सफेद मक्खी)', 'Pink Bollworm (गुलाबी इल्ली)'],
    common_diseases: ['Bacterial Blight', 'Alternaria Leaf Spot', 'Grey Mildew'],
    climate_alerts: {
      humid_nights: 'Bollworm activity increases in humid nights',
      continuous_rain: 'Bacterial blight spreads in wet conditions',
      drought: 'Sucking pests increase during dry spells'
    }
  },
  
  // Soybean
  'Soybean': {
    icar_reference: 'ICAR-IISR Indore Guidelines 2024',
    recommended_varieties: ['JS 9560', 'JS 2034', 'NRC 142'],
    seed_rate_kg_ha: '75-80',
    sowing_period: 'June 20 - July 10',
    common_pests: ['Girdle Beetle (गर्डल बीटल)', 'Stem Fly (तना मक्खी)', 'Defoliators'],
    common_diseases: ['Collar Rot (कॉलर रॉट)', 'Charcoal Rot', 'Rust (रतुआ)'],
    climate_alerts: {
      waterlogging: 'Collar rot increases in waterlogged conditions',
      dry_spell: 'Charcoal rot risk during prolonged dry spell',
      late_rain: 'Rain at harvest causes seed quality deterioration'
    }
  },
  
  // Maize
  'Maize': {
    icar_reference: 'ICAR-DMR Guidelines 2024',
    recommended_varieties: ['HQPM 1', 'DHM 117', 'Pioneer 30V92'],
    seed_rate_kg_ha: '20-25',
    sowing_period: 'June-July (Kharif) / Oct-Nov (Rabi)',
    common_pests: ['Fall Armyworm (सैनिक कीट)', 'Stem Borer (तना छेदक)', 'Shoot Fly'],
    common_diseases: ['Maydis Leaf Blight', 'Turcicum Leaf Blight', 'Stalk Rot'],
    climate_alerts: {
      high_humidity: 'Leaf blight spreads in humid weather',
      waterlogging: 'Stalk rot risk in waterlogged fields',
      drought: 'Poor cob filling if drought at silking stage'
    }
  },
  
  // Sugarcane
  'Sugarcane': {
    icar_reference: 'ICAR-SBI Coimbatore Bulletin 2024',
    recommended_varieties: ['Co 0238', 'CoJN 86-600', 'Co 86032'],
    seed_rate: '35000-40000 setts/ha',
    sowing_period: 'October-March',
    common_pests: ['Top Borer (शीर्ष छेदक)', 'Woolly Aphid (रोएंदार माहू)', 'White Grub'],
    common_diseases: ['Red Rot (लाल सड़न)', 'Smut (कंड)', 'Wilt (उकठा)'],
    climate_alerts: {
      waterlogging: 'Red rot spreads in waterlogged conditions',
      drought: 'Water stress causes yield reduction',
      high_temp: 'Good for ripening, reduce irrigation'
    }
  }
};

/**
 * Get crop-specific ICAR guidance
 */
export function getIcarGuidance(cropName: string): string {
  const crop = icarGuidelines[cropName];
  if (!crop) return '';
  
  return `
📚 ICAR Reference: ${crop.icar_reference}
🌱 Recommended Varieties: ${crop.recommended_varieties.join(', ')}
📊 Seed Rate: ${crop.seed_rate_kg_ha || crop.seed_rate}
⏰ Ideal Sowing: ${crop.sowing_period}

⚠️ COMMON PESTS IN THIS CROP:
${crop.common_pests.map((p: string) => `• ${p}`).join('\n')}

🦠 COMMON DISEASES:
${crop.common_diseases.map((d: string) => `• ${d}`).join('\n')}
`;
}

/**
 * Get climate-based alerts for crop
 */
export function getClimateAlerts(cropName: string, weather: any): string[] {
  const crop = icarGuidelines[cropName];
  if (!crop) return [];
  
  const alerts: string[] = [];
  
  if (weather?.current?.humidity > 80 && crop.climate_alerts?.high_humidity) {
    alerts.push(crop.climate_alerts.high_humidity);
  }
  
  if (weather?.current?.temp > 35 && crop.climate_alerts?.high_temp) {
    alerts.push(crop.climate_alerts.high_temp);
  }
  
  // Check for continuous rain in forecast
  const rainyDays = weather?.forecast?.filter((f: any) => f.rainfall > 10)?.length || 0;
  if (rainyDays >= 3 && crop.climate_alerts?.continuous_rain) {
    alerts.push(crop.climate_alerts.continuous_rain);
  }
  
  // Check for drought
  const totalRainfall = weather?.forecast?.reduce((sum: number, f: any) => sum + (f.rainfall || 0), 0) || 0;
  if (totalRainfall < 5 && crop.climate_alerts?.drought) {
    alerts.push(crop.climate_alerts.drought);
  }
  
  return alerts;
}
