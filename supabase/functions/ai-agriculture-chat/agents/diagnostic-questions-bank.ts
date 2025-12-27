/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DIAGNOSTIC QUESTIONS BANK v3.0
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Comprehensive question library for hypothesis confirmation/elimination.
 * Each question has:
 * - Trilingual text (Marathi, Hindi, English)
 * - Information gain score
 * - Target hypotheses
 * - Expected answers for confirmation
 */

import {
  DiagnosticQuestion,
  QuestionOption,
} from './hypothesis-types.ts';

// ═══════════════════════════════════════════════════════════════════════════
// PEST IDENTIFICATION QUESTIONS
// ═══════════════════════════════════════════════════════════════════════════

export const PEST_IDENTIFICATION_QUESTIONS: DiagnosticQuestion[] = [
  {
    question_id: 'Q_PEST_COLOR',
    hypothesis_targeted: ['APHID', 'WHITEFLY', 'JASSID', 'THRIPS', 'MEALYBUG'],
    question_text_mr: 'किडींचा रंग काय आहे?',
    question_text_hi: 'कीड़ों का रंग क्या है?',
    question_text_en: 'What color are the insects?',
    question_type: 'MULTIPLE_CHOICE',
    options: [
      { 
        value: 'GREEN', 
        label_mr: 'हिरवा', 
        label_hi: 'हरा', 
        label_en: 'Green',
        confidence_effect: { 'APHID': 0.15, 'JASSID': 0.10, 'WHITEFLY': -0.05 }
      },
      { 
        value: 'WHITE', 
        label_mr: 'पांढरा', 
        label_hi: 'सफेद', 
        label_en: 'White',
        confidence_effect: { 'WHITEFLY': 0.20, 'MEALYBUG': 0.15, 'APHID': -0.10 }
      },
      { 
        value: 'BLACK', 
        label_mr: 'काळा', 
        label_hi: 'काला', 
        label_en: 'Black',
        confidence_effect: { 'APHID': 0.10, 'THRIPS': 0.05 }
      },
      { 
        value: 'YELLOW', 
        label_mr: 'पिवळा', 
        label_hi: 'पीला', 
        label_en: 'Yellow',
        confidence_effect: { 'THRIPS': 0.15, 'JASSID': 0.10 }
      },
      { 
        value: 'BROWN', 
        label_mr: 'तपकिरी', 
        label_hi: 'भूरा', 
        label_en: 'Brown',
        confidence_effect: { 'MEALYBUG': 0.10, 'BOLLWORM': 0.15 }
      }
    ],
    expected_answer_if_true: 'GREEN',
    information_gain: 0.85,
    category: 'PEST_IDENTIFICATION',
    ask_priority: 1,
    skip_if_urgent: false
  },
  {
    question_id: 'Q_PEST_FLYING',
    hypothesis_targeted: ['APHID', 'WHITEFLY', 'JASSID'],
    question_text_mr: 'किडी उडतात का?',
    question_text_hi: 'क्या कीड़े उड़ते हैं?',
    question_text_en: 'Do the insects fly?',
    question_type: 'YES_NO',
    options: [
      { 
        value: 'YES', 
        label_mr: 'हो', 
        label_hi: 'हाँ', 
        label_en: 'Yes',
        confidence_effect: { 'WHITEFLY': 0.25, 'JASSID': 0.15, 'APHID': -0.15 }
      },
      { 
        value: 'NO', 
        label_mr: 'नाही', 
        label_hi: 'नहीं', 
        label_en: 'No',
        confidence_effect: { 'APHID': 0.15, 'MEALYBUG': 0.10, 'WHITEFLY': -0.20 }
      }
    ],
    expected_answer_if_true: 'NO',
    answer_that_eliminates: 'YES',
    information_gain: 0.90,
    category: 'DIFFERENTIATING',
    ask_priority: 2,
    skip_if_urgent: false
  },
  {
    question_id: 'Q_PEST_SIZE',
    hypothesis_targeted: ['APHID', 'WHITEFLY', 'BOLLWORM', 'THRIPS'],
    question_text_mr: 'किडीचा आकार किती आहे?',
    question_text_hi: 'कीड़े का आकार क्या है?',
    question_text_en: 'What is the size of the insect?',
    question_type: 'MULTIPLE_CHOICE',
    options: [
      { 
        value: 'VERY_SMALL', 
        label_mr: 'अगदी लहान (1-2mm)', 
        label_hi: 'बहुत छोटा (1-2mm)', 
        label_en: 'Very small (1-2mm)',
        confidence_effect: { 'APHID': 0.15, 'THRIPS': 0.20, 'WHITEFLY': 0.10 }
      },
      { 
        value: 'SMALL', 
        label_mr: 'लहान (3-5mm)', 
        label_hi: 'छोटा (3-5mm)', 
        label_en: 'Small (3-5mm)',
        confidence_effect: { 'JASSID': 0.15, 'APHID': 0.10 }
      },
      { 
        value: 'MEDIUM', 
        label_mr: 'मध्यम (5-15mm)', 
        label_hi: 'मध्यम (5-15mm)', 
        label_en: 'Medium (5-15mm)',
        confidence_effect: { 'BOLLWORM': 0.20 }
      },
      { 
        value: 'LARGE', 
        label_mr: 'मोठी (15mm+)', 
        label_hi: 'बड़ा (15mm+)', 
        label_en: 'Large (15mm+)',
        confidence_effect: { 'BOLLWORM': 0.25, 'APHID': -0.15, 'WHITEFLY': -0.15 }
      }
    ],
    expected_answer_if_true: 'VERY_SMALL',
    information_gain: 0.75,
    category: 'PEST_IDENTIFICATION',
    ask_priority: 3,
    skip_if_urgent: true
  },
  {
    question_id: 'Q_PEST_LOCATION',
    hypothesis_targeted: ['APHID', 'WHITEFLY', 'MEALYBUG', 'RED_SPIDER_MITE'],
    question_text_mr: 'किडी पानाच्या कोणत्या भागावर आहेत?',
    question_text_hi: 'कीड़े पत्ते के किस भाग पर हैं?',
    question_text_en: 'Where on the leaf are the insects?',
    question_type: 'MULTIPLE_CHOICE',
    options: [
      { 
        value: 'UNDERSIDE', 
        label_mr: 'खालच्या बाजूला', 
        label_hi: 'नीचे की तरफ', 
        label_en: 'Underside',
        confidence_effect: { 'APHID': 0.15, 'WHITEFLY': 0.15, 'RED_SPIDER_MITE': 0.20 }
      },
      { 
        value: 'TOP', 
        label_mr: 'वरच्या बाजूला', 
        label_hi: 'ऊपर की तरफ', 
        label_en: 'Top surface',
        confidence_effect: { 'THRIPS': 0.10 }
      },
      { 
        value: 'STEM', 
        label_mr: 'खोडावर', 
        label_hi: 'तने पर', 
        label_en: 'On stem',
        confidence_effect: { 'MEALYBUG': 0.20, 'APHID': 0.10 }
      },
      { 
        value: 'BOTH', 
        label_mr: 'दोन्ही बाजूला', 
        label_hi: 'दोनों तरफ', 
        label_en: 'Both sides',
        confidence_effect: { 'APHID': 0.10 }
      }
    ],
    expected_answer_if_true: 'UNDERSIDE',
    information_gain: 0.70,
    category: 'PEST_IDENTIFICATION',
    ask_priority: 4,
    skip_if_urgent: true
  },
  {
    question_id: 'Q_HONEYDEW',
    hypothesis_targeted: ['APHID', 'WHITEFLY', 'MEALYBUG'],
    question_text_mr: 'पानांवर चिकट पदार्थ (मधासारखा) दिसतो का?',
    question_text_hi: 'पत्तों पर चिपचिपा पदार्थ (शहद जैसा) दिखता है?',
    question_text_en: 'Is there sticky substance (honeydew) on leaves?',
    question_type: 'YES_NO',
    options: [
      { 
        value: 'YES', 
        label_mr: 'हो', 
        label_hi: 'हाँ', 
        label_en: 'Yes',
        confidence_effect: { 'APHID': 0.20, 'WHITEFLY': 0.15, 'MEALYBUG': 0.15, 'THRIPS': -0.10 }
      },
      { 
        value: 'NO', 
        label_mr: 'नाही', 
        label_hi: 'नहीं', 
        label_en: 'No',
        confidence_effect: { 'THRIPS': 0.10, 'RED_SPIDER_MITE': 0.10 }
      }
    ],
    expected_answer_if_true: 'YES',
    information_gain: 0.85,
    category: 'SYMPTOM_DETAIL',
    ask_priority: 2,
    skip_if_urgent: false
  },
  {
    question_id: 'Q_PEST_DENSITY',
    hypothesis_targeted: ['APHID', 'WHITEFLY', 'JASSID', 'THRIPS'],
    question_text_mr: 'प्रत्येक पानावर अंदाजे किती किडी आहेत?',
    question_text_hi: 'हर पत्ते पर लगभग कितने कीड़े हैं?',
    question_text_en: 'Approximately how many insects per leaf?',
    question_type: 'MULTIPLE_CHOICE',
    options: [
      { value: '5', label_mr: '5 पेक्षा कमी', label_hi: '5 से कम', label_en: 'Less than 5' },
      { value: '10', label_mr: '5-10', label_hi: '5-10', label_en: '5-10' },
      { value: '20', label_mr: '10-20', label_hi: '10-20', label_en: '10-20' },
      { value: '30', label_mr: '20-30', label_hi: '20-30', label_en: '20-30' },
      { value: '50', label_mr: '30 पेक्षा जास्त', label_hi: '30 से ज्यादा', label_en: 'More than 30' }
    ],
    expected_answer_if_true: '20',
    information_gain: 0.80,
    category: 'SEVERITY_ASSESSMENT',
    ask_priority: 3,
    skip_if_urgent: false
  }
];

// ═══════════════════════════════════════════════════════════════════════════
// DISEASE IDENTIFICATION QUESTIONS
// ═══════════════════════════════════════════════════════════════════════════

export const DISEASE_IDENTIFICATION_QUESTIONS: DiagnosticQuestion[] = [
  {
    question_id: 'Q_SPOT_COLOR',
    hypothesis_targeted: ['BACTERIAL_BLIGHT', 'FUNGAL_LEAF_SPOT', 'ANTHRACNOSE', 'RUST'],
    question_text_mr: 'डागांचा रंग काय आहे?',
    question_text_hi: 'दागों का रंग क्या है?',
    question_text_en: 'What color are the spots?',
    question_type: 'MULTIPLE_CHOICE',
    options: [
      { 
        value: 'BROWN', 
        label_mr: 'तपकिरी', 
        label_hi: 'भूरा', 
        label_en: 'Brown',
        confidence_effect: { 'FUNGAL_LEAF_SPOT': 0.15, 'BACTERIAL_BLIGHT': 0.10 }
      },
      { 
        value: 'YELLOW', 
        label_mr: 'पिवळा', 
        label_hi: 'पीला', 
        label_en: 'Yellow',
        confidence_effect: { 'NITROGEN_DEFICIENCY': 0.15, 'VIRAL_DISEASE': 0.10 }
      },
      { 
        value: 'BLACK', 
        label_mr: 'काळा', 
        label_hi: 'काला', 
        label_en: 'Black',
        confidence_effect: { 'ANTHRACNOSE': 0.20, 'BACTERIAL_BLIGHT': 0.15 }
      },
      { 
        value: 'ORANGE', 
        label_mr: 'नारंगी', 
        label_hi: 'नारंगी', 
        label_en: 'Orange/Rust',
        confidence_effect: { 'RUST': 0.30, 'FUNGAL_LEAF_SPOT': -0.10 }
      },
      { 
        value: 'WHITE_POWDERY', 
        label_mr: 'पांढरा पावडरसारखा', 
        label_hi: 'सफेद पाउडर जैसा', 
        label_en: 'White powdery',
        confidence_effect: { 'POWDERY_MILDEW': 0.35 }
      }
    ],
    expected_answer_if_true: 'BROWN',
    information_gain: 0.85,
    category: 'DISEASE_IDENTIFICATION',
    ask_priority: 1,
    skip_if_urgent: false
  },
  {
    question_id: 'Q_SPOT_PATTERN',
    hypothesis_targeted: ['BACTERIAL_BLIGHT', 'FUNGAL_LEAF_SPOT', 'VIRAL_DISEASE'],
    question_text_mr: 'डाग कसे दिसतात?',
    question_text_hi: 'दाग कैसे दिखते हैं?',
    question_text_en: 'What do the spots look like?',
    question_type: 'MULTIPLE_CHOICE',
    options: [
      { 
        value: 'CIRCULAR', 
        label_mr: 'गोल', 
        label_hi: 'गोल', 
        label_en: 'Circular',
        confidence_effect: { 'FUNGAL_LEAF_SPOT': 0.20 }
      },
      { 
        value: 'ANGULAR', 
        label_mr: 'कोनेदार', 
        label_hi: 'कोणीय', 
        label_en: 'Angular',
        confidence_effect: { 'BACTERIAL_BLIGHT': 0.25 }
      },
      { 
        value: 'IRREGULAR', 
        label_mr: 'अनियमित', 
        label_hi: 'अनियमित', 
        label_en: 'Irregular',
        confidence_effect: { 'ANTHRACNOSE': 0.15 }
      },
      { 
        value: 'RINGS', 
        label_mr: 'कड्यांसारखे', 
        label_hi: 'छल्ले जैसे', 
        label_en: 'Concentric rings',
        confidence_effect: { 'VIRAL_DISEASE': 0.20, 'FUNGAL_LEAF_SPOT': 0.10 }
      }
    ],
    expected_answer_if_true: 'ANGULAR',
    information_gain: 0.80,
    category: 'DISEASE_IDENTIFICATION',
    ask_priority: 2,
    skip_if_urgent: true
  },
  {
    question_id: 'Q_WILTING_PATTERN',
    hypothesis_targeted: ['WILT', 'ROOT_ROT', 'WATER_STRESS'],
    question_text_mr: 'झाड कसे कोमेजते?',
    question_text_hi: 'पौधा कैसे मुरझाता है?',
    question_text_en: 'How does the plant wilt?',
    question_type: 'MULTIPLE_CHOICE',
    options: [
      { 
        value: 'ONE_SIDE', 
        label_mr: 'एका बाजूने', 
        label_hi: 'एक तरफ से', 
        label_en: 'One side first',
        confidence_effect: { 'WILT': 0.30, 'WATER_STRESS': -0.15 }
      },
      { 
        value: 'WHOLE_PLANT', 
        label_mr: 'संपूर्ण झाड एकदम', 
        label_hi: 'पूरा पौधा एक साथ', 
        label_en: 'Whole plant at once',
        confidence_effect: { 'WATER_STRESS': 0.25, 'ROOT_ROT': 0.15 }
      },
      { 
        value: 'TIPS_FIRST', 
        label_mr: 'टोकापासून सुरुवात', 
        label_hi: 'सिरे से शुरुआत', 
        label_en: 'Tips/edges first',
        confidence_effect: { 'WATER_STRESS': 0.20 }
      },
      { 
        value: 'LOWER_LEAVES', 
        label_mr: 'खालची पाने आधी', 
        label_hi: 'नीचे के पत्ते पहले', 
        label_en: 'Lower leaves first',
        confidence_effect: { 'ROOT_ROT': 0.20, 'NITROGEN_DEFICIENCY': 0.15 }
      }
    ],
    expected_answer_if_true: 'ONE_SIDE',
    information_gain: 0.85,
    category: 'DISEASE_IDENTIFICATION',
    ask_priority: 1,
    skip_if_urgent: false
  }
];

// ═══════════════════════════════════════════════════════════════════════════
// NUTRIENT DEFICIENCY QUESTIONS
// ═══════════════════════════════════════════════════════════════════════════

export const NUTRIENT_QUESTIONS: DiagnosticQuestion[] = [
  {
    question_id: 'Q_YELLOW_PATTERN',
    hypothesis_targeted: ['NITROGEN_DEFICIENCY', 'IRON_DEFICIENCY', 'MAGNESIUM_DEFICIENCY'],
    question_text_mr: 'पाने कुठून पिवळी होत आहेत?',
    question_text_hi: 'पत्ते कहाँ से पीले हो रहे हैं?',
    question_text_en: 'Where does yellowing start on leaves?',
    question_type: 'MULTIPLE_CHOICE',
    options: [
      { 
        value: 'OLDER_LEAVES', 
        label_mr: 'खालची/जुनी पाने', 
        label_hi: 'नीचे के/पुराने पत्ते', 
        label_en: 'Older/lower leaves',
        confidence_effect: { 'NITROGEN_DEFICIENCY': 0.25, 'MAGNESIUM_DEFICIENCY': 0.15 }
      },
      { 
        value: 'NEWER_LEAVES', 
        label_mr: 'वरची/नवीन पाने', 
        label_hi: 'ऊपर के/नए पत्ते', 
        label_en: 'Newer/upper leaves',
        confidence_effect: { 'IRON_DEFICIENCY': 0.25, 'NITROGEN_DEFICIENCY': -0.10 }
      },
      { 
        value: 'BETWEEN_VEINS', 
        label_mr: 'शिरांमध्ये', 
        label_hi: 'नसों के बीच', 
        label_en: 'Between veins',
        confidence_effect: { 'IRON_DEFICIENCY': 0.20, 'MAGNESIUM_DEFICIENCY': 0.20 }
      },
      { 
        value: 'WHOLE_LEAF', 
        label_mr: 'संपूर्ण पान', 
        label_hi: 'पूरा पत्ता', 
        label_en: 'Whole leaf',
        confidence_effect: { 'NITROGEN_DEFICIENCY': 0.20 }
      }
    ],
    expected_answer_if_true: 'OLDER_LEAVES',
    information_gain: 0.90,
    category: 'SYMPTOM_DETAIL',
    ask_priority: 1,
    skip_if_urgent: false
  },
  {
    question_id: 'Q_LAST_FERTILIZER',
    hypothesis_targeted: ['NITROGEN_DEFICIENCY', 'PHOSPHORUS_DEFICIENCY', 'POTASSIUM_DEFICIENCY'],
    question_text_mr: 'शेवटचे खत कधी दिले?',
    question_text_hi: 'आखिरी बार खाद कब दी?',
    question_text_en: 'When was the last fertilizer applied?',
    question_type: 'MULTIPLE_CHOICE',
    options: [
      { value: 'NEVER', label_mr: 'दिले नाही', label_hi: 'नहीं दी', label_en: 'Not applied' },
      { value: '1_WEEK', label_mr: '1 आठवड्यापूर्वी', label_hi: '1 हफ्ते पहले', label_en: '1 week ago' },
      { value: '2_WEEKS', label_mr: '2 आठवड्यापूर्वी', label_hi: '2 हफ्ते पहले', label_en: '2 weeks ago' },
      { value: '1_MONTH', label_mr: '1 महिन्यापूर्वी', label_hi: '1 महीने पहले', label_en: '1 month ago' },
      { value: 'MORE', label_mr: '1 महिन्यापेक्षा जास्त', label_hi: '1 महीने से ज्यादा', label_en: 'More than 1 month' }
    ],
    expected_answer_if_true: 'MORE',
    information_gain: 0.75,
    category: 'TREATMENT_HISTORY',
    ask_priority: 2,
    skip_if_urgent: true
  }
];

// ═══════════════════════════════════════════════════════════════════════════
// SEVERITY AND TIMING QUESTIONS
// ═══════════════════════════════════════════════════════════════════════════

export const SEVERITY_TIMING_QUESTIONS: DiagnosticQuestion[] = [
  {
    question_id: 'Q_AFFECTED_AREA',
    hypothesis_targeted: ['*'], // Applies to all hypotheses
    question_text_mr: 'किती टक्के शेतात समस्या दिसते?',
    question_text_hi: 'कितने प्रतिशत खेत में समस्या दिखती है?',
    question_text_en: 'What percentage of field is affected?',
    question_type: 'MULTIPLE_CHOICE',
    options: [
      { value: '10', label_mr: '10% पर्यंत', label_hi: '10% तक', label_en: 'Up to 10%' },
      { value: '25', label_mr: '10-25%', label_hi: '10-25%', label_en: '10-25%' },
      { value: '50', label_mr: '25-50%', label_hi: '25-50%', label_en: '25-50%' },
      { value: '75', label_mr: '50-75%', label_hi: '50-75%', label_en: '50-75%' },
      { value: '90', label_mr: '75% पेक्षा जास्त', label_hi: '75% से ज्यादा', label_en: 'More than 75%' }
    ],
    expected_answer_if_true: '25',
    information_gain: 0.70,
    category: 'SEVERITY_ASSESSMENT',
    ask_priority: 3,
    skip_if_urgent: true
  },
  {
    question_id: 'Q_DURATION',
    hypothesis_targeted: ['*'],
    question_text_mr: 'समस्या किती दिवसांपासून आहे?',
    question_text_hi: 'समस्या कितने दिनों से है?',
    question_text_en: 'How many days has this problem been present?',
    question_type: 'MULTIPLE_CHOICE',
    options: [
      { value: '2', label_mr: '1-2 दिवस', label_hi: '1-2 दिन', label_en: '1-2 days' },
      { value: '5', label_mr: '3-5 दिवस', label_hi: '3-5 दिन', label_en: '3-5 days' },
      { value: '10', label_mr: '1 आठवडा', label_hi: '1 हफ्ता', label_en: '1 week' },
      { value: '20', label_mr: '2 आठवडे', label_hi: '2 हफ्ते', label_en: '2 weeks' },
      { value: '30', label_mr: '1 महिना+', label_hi: '1 महीना+', label_en: '1 month+' }
    ],
    expected_answer_if_true: '5',
    information_gain: 0.65,
    category: 'TIMING_DURATION',
    ask_priority: 4,
    skip_if_urgent: true
  },
  {
    question_id: 'Q_PROGRESSION',
    hypothesis_targeted: ['*'],
    question_text_mr: 'समस्या वाढत आहे का?',
    question_text_hi: 'क्या समस्या बढ़ रही है?',
    question_text_en: 'Is the problem spreading/getting worse?',
    question_type: 'MULTIPLE_CHOICE',
    options: [
      { value: 'RAPID', label_mr: 'खूप वेगाने वाढतंय', label_hi: 'बहुत तेजी से बढ़ रहा है', label_en: 'Spreading rapidly' },
      { value: 'SLOW', label_mr: 'हळूहळू वाढतंय', label_hi: 'धीरे-धीरे बढ़ रहा है', label_en: 'Spreading slowly' },
      { value: 'STABLE', label_mr: 'तसेच आहे', label_hi: 'वैसा ही है', label_en: 'Staying same' },
      { value: 'IMPROVING', label_mr: 'कमी होतंय', label_hi: 'कम हो रहा है', label_en: 'Getting better' }
    ],
    expected_answer_if_true: 'SLOW',
    information_gain: 0.75,
    category: 'SEVERITY_ASSESSMENT',
    ask_priority: 2,
    skip_if_urgent: false
  }
];

// ═══════════════════════════════════════════════════════════════════════════
// TREATMENT HISTORY QUESTIONS
// ═══════════════════════════════════════════════════════════════════════════

export const TREATMENT_HISTORY_QUESTIONS: DiagnosticQuestion[] = [
  {
    question_id: 'Q_PREVIOUS_SPRAY',
    hypothesis_targeted: ['*'],
    question_text_mr: 'या समस्येसाठी आधी काही फवारणी केली का?',
    question_text_hi: 'इस समस्या के लिए पहले कोई छिड़काव किया था?',
    question_text_en: 'Did you spray anything for this problem before?',
    question_type: 'YES_NO',
    options: [
      { value: 'YES', label_mr: 'हो', label_hi: 'हाँ', label_en: 'Yes' },
      { value: 'NO', label_mr: 'नाही', label_hi: 'नहीं', label_en: 'No' }
    ],
    expected_answer_if_true: 'NO',
    information_gain: 0.60,
    category: 'TREATMENT_HISTORY',
    ask_priority: 5,
    skip_if_urgent: true
  },
  {
    question_id: 'Q_SPRAY_RESULT',
    hypothesis_targeted: ['*'],
    question_text_mr: 'मागील फवारणीनंतर काय झाले?',
    question_text_hi: 'पिछले छिड़काव के बाद क्या हुआ?',
    question_text_en: 'What happened after previous spray?',
    question_type: 'MULTIPLE_CHOICE',
    prerequisite_questions: ['Q_PREVIOUS_SPRAY'],
    options: [
      { value: 'WORKED', label_mr: 'फायदा झाला', label_hi: 'फायदा हुआ', label_en: 'It worked' },
      { value: 'PARTIAL', label_mr: 'थोडा फायदा', label_hi: 'थोड़ा फायदा', label_en: 'Partial improvement' },
      { value: 'NO_EFFECT', label_mr: 'काही फरक नाही', label_hi: 'कोई फर्क नहीं', label_en: 'No effect' },
      { value: 'WORSE', label_mr: 'समस्या वाढली', label_hi: 'समस्या बढ़ गई', label_en: 'Got worse' }
    ],
    expected_answer_if_true: 'WORKED',
    information_gain: 0.75,
    category: 'TREATMENT_HISTORY',
    ask_priority: 5,
    skip_if_urgent: true
  }
];

// ═══════════════════════════════════════════════════════════════════════════
// COMPLETE QUESTIONS BANK
// ═══════════════════════════════════════════════════════════════════════════

export const DIAGNOSTIC_QUESTIONS_BANK: DiagnosticQuestion[] = [
  ...PEST_IDENTIFICATION_QUESTIONS,
  ...DISEASE_IDENTIFICATION_QUESTIONS,
  ...NUTRIENT_QUESTIONS,
  ...SEVERITY_TIMING_QUESTIONS,
  ...TREATMENT_HISTORY_QUESTIONS
];

/**
 * Get questions relevant to a specific hypothesis
 */
export function getQuestionsForHypothesis(hypothesisCode: string): DiagnosticQuestion[] {
  return DIAGNOSTIC_QUESTIONS_BANK.filter(q => 
    q.hypothesis_targeted.includes(hypothesisCode) || 
    q.hypothesis_targeted.includes('*')
  ).sort((a, b) => a.ask_priority - b.ask_priority);
}

/**
 * Get differentiating questions between two hypotheses
 */
export function getDifferentiatingQuestions(
  hypothesis1: string, 
  hypothesis2: string
): DiagnosticQuestion[] {
  return DIAGNOSTIC_QUESTIONS_BANK.filter(q => 
    q.hypothesis_targeted.includes(hypothesis1) && 
    q.hypothesis_targeted.includes(hypothesis2) &&
    q.category === 'DIFFERENTIATING'
  ).sort((a, b) => b.information_gain - a.information_gain);
}

/**
 * Get questions by category
 */
export function getQuestionsByCategory(category: DiagnosticQuestion['category']): DiagnosticQuestion[] {
  return DIAGNOSTIC_QUESTIONS_BANK.filter(q => q.category === category);
}

export default DIAGNOSTIC_QUESTIONS_BANK;
