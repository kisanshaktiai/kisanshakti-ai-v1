// ============= FOLLOW-UP QUESTIONS GENERATOR =============
// Generates intelligent follow-up questions based on AI response and context

export interface FollowUpQuestion {
  id: string;
  text: string;
  category: 'clarification' | 'next_step' | 'alternative' | 'prevention';
  emoji: string;
}

export function generateFollowUpQuestions(
  aiResponse: string,
  userQuery: string,
  language: string,
  landContext?: any
): FollowUpQuestion[] {
  const questions: FollowUpQuestion[] = [];
  const lowerResponse = aiResponse.toLowerCase();
  const lowerQuery = userQuery.toLowerCase();
  
  // Detect response topic and generate relevant follow-ups
  const topicFollowUps = getTopicBasedFollowUps(lowerResponse, language, landContext);
  questions.push(...topicFollowUps);
  
  // Add general helpful follow-ups
  const generalFollowUps = getGeneralFollowUps(lowerResponse, language);
  questions.push(...generalFollowUps);
  
  // Deduplicate and limit to 3 questions
  const uniqueQuestions = questions.filter((q, i, arr) => 
    arr.findIndex(x => x.text === q.text) === i
  );
  
  return uniqueQuestions.slice(0, 3);
}

function getTopicBasedFollowUps(
  response: string,
  language: string,
  landContext?: any
): FollowUpQuestion[] {
  const followUps: FollowUpQuestion[] = [];
  
  // Fertilizer-related response
  if (response.includes('fertilizer') || response.includes('खाद') || response.includes('खत') ||
      response.includes('urea') || response.includes('dap') || response.includes('npk')) {
    followUps.push(...getFertilizerFollowUps(language));
  }
  
  // Pest/Disease-related response
  if (response.includes('pest') || response.includes('disease') || response.includes('spray') ||
      response.includes('कीड़े') || response.includes('रोग') || response.includes('छिड़काव') ||
      response.includes('किडा') || response.includes('फवारणी')) {
    followUps.push(...getPestDiseaseFollowUps(language));
  }
  
  // Irrigation-related response
  if (response.includes('water') || response.includes('irrigation') || response.includes('drip') ||
      response.includes('पानी') || response.includes('सिंचाई') || response.includes('ड्रिप') ||
      response.includes('पाणी') || response.includes('सिंचन')) {
    followUps.push(...getIrrigationFollowUps(language));
  }
  
  // Organic-related response
  if (response.includes('organic') || response.includes('natural') || response.includes('bio') ||
      response.includes('जैविक') || response.includes('प्राकृतिक') ||
      response.includes('सेंद्रिय') || response.includes('नैसर्गिक')) {
    followUps.push(...getOrganicFollowUps(language));
  }
  
  // Growth stage related
  if (response.includes('flowering') || response.includes('harvest') || response.includes('sowing') ||
      response.includes('फूल') || response.includes('कटाई') || response.includes('बुवाई') ||
      response.includes('फुले') || response.includes('कापणी') || response.includes('पेरणी')) {
    followUps.push(...getGrowthStageFollowUps(language, landContext));
  }
  
  return followUps;
}

function getFertilizerFollowUps(language: string): FollowUpQuestion[] {
  const followUps: Record<string, FollowUpQuestion[]> = {
    en: [
      { id: 'f1', text: 'What is the best time to apply fertilizer?', category: 'clarification', emoji: '⏰' },
      { id: 'f2', text: 'Show me organic fertilizer options', category: 'alternative', emoji: '🌿' },
      { id: 'f3', text: 'How to check if soil needs more fertilizer?', category: 'clarification', emoji: '🔍' }
    ],
    hi: [
      { id: 'f1', text: 'खाद डालने का सबसे अच्छा समय कौनसा है?', category: 'clarification', emoji: '⏰' },
      { id: 'f2', text: 'जैविक खाद के विकल्प बताएं', category: 'alternative', emoji: '🌿' },
      { id: 'f3', text: 'कैसे पता चलेगा कि और खाद चाहिए?', category: 'clarification', emoji: '🔍' }
    ],
    mr: [
      { id: 'f1', text: 'खत टाकण्याची योग्य वेळ कोणती?', category: 'clarification', emoji: '⏰' },
      { id: 'f2', text: 'सेंद्रिय खताचे पर्याय सांगा', category: 'alternative', emoji: '🌿' },
      { id: 'f3', text: 'अजून खत हवे का कसे समजेल?', category: 'clarification', emoji: '🔍' }
    ]
  };
  
  return followUps[language] || followUps.en;
}

function getPestDiseaseFollowUps(language: string): FollowUpQuestion[] {
  const followUps: Record<string, FollowUpQuestion[]> = {
    en: [
      { id: 'p1', text: 'How to prevent this problem in future?', category: 'prevention', emoji: '🛡️' },
      { id: 'p2', text: 'Show organic pest control methods', category: 'alternative', emoji: '🌿' },
      { id: 'p3', text: 'When should I spray next?', category: 'next_step', emoji: '📅' }
    ],
    hi: [
      { id: 'p1', text: 'भविष्य में इसे कैसे रोकें?', category: 'prevention', emoji: '🛡️' },
      { id: 'p2', text: 'जैविक कीट नियंत्रण बताएं', category: 'alternative', emoji: '🌿' },
      { id: 'p3', text: 'अगला छिड़काव कब करूं?', category: 'next_step', emoji: '📅' }
    ],
    mr: [
      { id: 'p1', text: 'भविष्यात हे कसे टाळता येईल?', category: 'prevention', emoji: '🛡️' },
      { id: 'p2', text: 'सेंद्रिय किडे नियंत्रण सांगा', category: 'alternative', emoji: '🌿' },
      { id: 'p3', text: 'पुढची फवारणी कधी करू?', category: 'next_step', emoji: '📅' }
    ]
  };
  
  return followUps[language] || followUps.en;
}

function getIrrigationFollowUps(language: string): FollowUpQuestion[] {
  const followUps: Record<string, FollowUpQuestion[]> = {
    en: [
      { id: 'i1', text: 'How much water does my crop need daily?', category: 'clarification', emoji: '💧' },
      { id: 'i2', text: 'Best time for irrigation?', category: 'clarification', emoji: '⏰' },
      { id: 'i3', text: 'How to save water while irrigating?', category: 'alternative', emoji: '♻️' }
    ],
    hi: [
      { id: 'i1', text: 'फसल को रोज कितना पानी चाहिए?', category: 'clarification', emoji: '💧' },
      { id: 'i2', text: 'पानी देने का सही समय?', category: 'clarification', emoji: '⏰' },
      { id: 'i3', text: 'पानी कैसे बचाएं?', category: 'alternative', emoji: '♻️' }
    ],
    mr: [
      { id: 'i1', text: 'पिकाला रोज किती पाणी लागते?', category: 'clarification', emoji: '💧' },
      { id: 'i2', text: 'पाणी देण्याची योग्य वेळ?', category: 'clarification', emoji: '⏰' },
      { id: 'i3', text: 'पाणी कसे वाचवायचे?', category: 'alternative', emoji: '♻️' }
    ]
  };
  
  return followUps[language] || followUps.en;
}

function getOrganicFollowUps(language: string): FollowUpQuestion[] {
  const followUps: Record<string, FollowUpQuestion[]> = {
    en: [
      { id: 'o1', text: 'How to make this organic solution at home?', category: 'clarification', emoji: '🏠' },
      { id: 'o2', text: 'Is this safe for all crops?', category: 'clarification', emoji: '✅' },
      { id: 'o3', text: 'How long until I see results?', category: 'next_step', emoji: '📊' }
    ],
    hi: [
      { id: 'o1', text: 'घर पर यह जैविक घोल कैसे बनाएं?', category: 'clarification', emoji: '🏠' },
      { id: 'o2', text: 'क्या यह सभी फसलों के लिए सुरक्षित है?', category: 'clarification', emoji: '✅' },
      { id: 'o3', text: 'असर कितने दिन में दिखेगा?', category: 'next_step', emoji: '📊' }
    ],
    mr: [
      { id: 'o1', text: 'हे सेंद्रिय द्रावण घरी कसे बनवायचे?', category: 'clarification', emoji: '🏠' },
      { id: 'o2', text: 'हे सर्व पिकांसाठी सुरक्षित आहे का?', category: 'clarification', emoji: '✅' },
      { id: 'o3', text: 'परिणाम किती दिवसात दिसेल?', category: 'next_step', emoji: '📊' }
    ]
  };
  
  return followUps[language] || followUps.en;
}

function getGrowthStageFollowUps(language: string, landContext?: any): FollowUpQuestion[] {
  const crop = landContext?.current_crop || landContext?.crop_name || 'crop';
  
  const followUps: Record<string, FollowUpQuestion[]> = {
    en: [
      { id: 'g1', text: `What care does ${crop} need at this stage?`, category: 'clarification', emoji: '🌱' },
      { id: 'g2', text: 'When will my crop be ready for harvest?', category: 'next_step', emoji: '🌾' },
      { id: 'g3', text: 'How to increase yield at this stage?', category: 'alternative', emoji: '📈' }
    ],
    hi: [
      { id: 'g1', text: `इस अवस्था में ${crop} की क्या देखभाल करें?`, category: 'clarification', emoji: '🌱' },
      { id: 'g2', text: 'फसल कब तैयार होगी?', category: 'next_step', emoji: '🌾' },
      { id: 'g3', text: 'इस समय उपज कैसे बढ़ाएं?', category: 'alternative', emoji: '📈' }
    ],
    mr: [
      { id: 'g1', text: `या अवस्थेत ${crop} ची काय काळजी घ्यायची?`, category: 'clarification', emoji: '🌱' },
      { id: 'g2', text: 'पीक कधी तयार होईल?', category: 'next_step', emoji: '🌾' },
      { id: 'g3', text: 'या वेळी उत्पादन कसे वाढवायचे?', category: 'alternative', emoji: '📈' }
    ]
  };
  
  return followUps[language] || followUps.en;
}

function getGeneralFollowUps(response: string, language: string): FollowUpQuestion[] {
  const followUps: Record<string, FollowUpQuestion[]> = {
    en: [
      { id: 'gen1', text: 'What else should I do this week?', category: 'next_step', emoji: '📋' },
      { id: 'gen2', text: 'How much will this cost?', category: 'clarification', emoji: '💰' }
    ],
    hi: [
      { id: 'gen1', text: 'इस हफ्ते और क्या करना चाहिए?', category: 'next_step', emoji: '📋' },
      { id: 'gen2', text: 'इसका खर्च कितना होगा?', category: 'clarification', emoji: '💰' }
    ],
    mr: [
      { id: 'gen1', text: 'या आठवड्यात आणखी काय करायचे?', category: 'next_step', emoji: '📋' },
      { id: 'gen2', text: 'याचा खर्च किती येईल?', category: 'clarification', emoji: '💰' }
    ]
  };
  
  return followUps[language] || followUps.en;
}
