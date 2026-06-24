/**
 * Safety Query Classifier
 * Determines if a query requires the full 9-agent orchestrator for safety verification
 */

// Keywords that indicate safety-critical queries requiring full orchestrator
const SAFETY_CRITICAL_KEYWORDS = {
  pesticides: [
    'pesticide', 'कीटनाशक', 'किडीनाशक', 'spray', 'स्प्रे', 'फवारणी',
    'insecticide', 'miticide', 'poison', 'विष', 'जहर',
    'imidacloprid', 'chlorpyriphos', 'thiamethoxam', 'profenofos',
    'cypermethrin', 'lambda', 'emamectin', 'spinosad', 'fipronil'
  ],
  fungicides: [
    'fungicide', 'फफूंदनाशक', 'बुरशीनाशक', 'anti-fungal',
    'carbendazim', 'mancozeb', 'copper', 'sulphur', 'propiconazole',
    'tebuconazole', 'hexaconazole', 'trifloxystrobin'
  ],
  herbicides: [
    'herbicide', 'weedicide', 'खरपतवार', 'तणनाशक',
    'glyphosate', 'paraquat', '2,4-d', 'atrazine', 'pendimethalin'
  ],
  chemicals: [
    'chemical', 'रासायनिक', 'दवाई', 'दवा', 'औषध', 'medicine',
    'dosage', 'dose', 'खुराक', 'मात्रा', 'ratio', 'mix', 'मिश्रण'
  ],
  pests_diseases: [
    'thrips', 'थ्रिप्स', 'aphid', 'माहू', 'मावा', 'borer', 'बोरर',
    'bollworm', 'बॉलवर्म', 'whitefly', 'सफेद मक्खी', 'mealybug',
    'blight', 'झुलसा', 'rust', 'गेरुआ', 'wilt', 'उकटा', 'मुरझान',
    'rot', 'सड़न', 'mildew', 'फफूंद', 'virus', 'mosaic', 'leaf curl'
  ],
  urgent: [
    'emergency', 'आपातकाल', 'dying', 'मर रहा', 'urgent', 'तुरंत',
    'severe', 'गंभीर', 'heavy attack', 'भारी हमला', 'complete loss'
  ]
};

// Simple queries that Decision Brain can handle (no safety verification needed)
const SIMPLE_QUERY_PATTERNS = [
  /^(hi|hello|namaste|नमस्ते|नमस्कार)/i,
  /what (is|are)|क्या है|काय आहे/i,
  /when (to|should)|कब|केव्हा/i,
  /how much water|पानी कितना|पाणी किती/i,
  /weather|मौसम|हवामान/i,
  /market price|भाव|बाजार/i,
  /soil test|मिट्टी जांच|माती तपासणी/i,
];

export interface QueryClassification {
  requiresOrchestrator: boolean;
  isSafetyCritical: boolean;
  category: 'pesticide' | 'fungicide' | 'herbicide' | 'chemical' | 'pest_disease' | 'urgent' | 'simple' | 'general';
  confidence: number;
  detectedKeywords: string[];
}

/**
 * Classify a query to determine routing
 */
export function classifyQueryForRouting(query: string): QueryClassification {
  const queryLower = query.toLowerCase();
  const detectedKeywords: string[] = [];
  let category: QueryClassification['category'] = 'general';
  let maxMatches = 0;
  
  // Check for simple queries first
  for (const pattern of SIMPLE_QUERY_PATTERNS) {
    if (pattern.test(queryLower)) {
      return {
        requiresOrchestrator: false,
        isSafetyCritical: false,
        category: 'simple',
        confidence: 0.9,
        detectedKeywords: []
      };
    }
  }
  
  // Check each category
  for (const [cat, keywords] of Object.entries(SAFETY_CRITICAL_KEYWORDS)) {
    const matches = keywords.filter(kw => queryLower.includes(kw.toLowerCase()));
    if (matches.length > maxMatches) {
      maxMatches = matches.length;
      category = cat as QueryClassification['category'];
      detectedKeywords.push(...matches);
    }
  }
  
  // Determine if orchestrator is required
  const isSafetyCritical = maxMatches > 0;
  const requiresOrchestrator = isSafetyCritical || category === 'urgent';
  
  return {
    requiresOrchestrator,
    isSafetyCritical,
    category: maxMatches > 0 ? category : 'general',
    confidence: Math.min(0.5 + (maxMatches * 0.15), 0.95),
    detectedKeywords
  };
}

/**
 * Check if a query mentions banned substances
 */
export function checkForBannedSubstances(query: string): { hasBanned: boolean; substances: string[] } {
  const BANNED_SUBSTANCES_INDIA = [
    'endosulfan', 'monocrotophos', 'dichlorvos', 'phosphamidon',
    'methyl parathion', 'triazophos', 'phorate', 'methomyl',
    'alachlor', 'dicofol', 'heptachlor', 'nitrofen', 'pentachlorophenol'
  ];
  
  const queryLower = query.toLowerCase();
  const found = BANNED_SUBSTANCES_INDIA.filter(s => queryLower.includes(s.toLowerCase()));
  
  return {
    hasBanned: found.length > 0,
    substances: found
  };
}
