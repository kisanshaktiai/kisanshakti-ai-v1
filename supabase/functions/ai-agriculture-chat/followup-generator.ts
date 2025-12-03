// ============= DYNAMIC AI-GENERATED FOLLOW-UP QUESTIONS =============
// Now generates questions dynamically based on AI response context

export interface FollowUpQuestion {
  id: string;
  text: string;
  category: 'income' | 'yield' | 'savings' | 'next_action' | 'expert_tip';
  emoji: string;
}

/**
 * Parse AI-generated follow-up questions from the response
 * The AI includes these in a structured format at the end of its response
 */
export function parseAIGeneratedFollowUps(
  aiResponse: string,
  language: string
): { cleanedResponse: string; followUpQuestions: FollowUpQuestion[] } {
  const followUpQuestions: FollowUpQuestion[] = [];
  let cleanedResponse = aiResponse;
  
  // Look for the follow-up section marker in the AI response
  // Format: 💡 FOLLOW_UP_QUESTIONS: [JSON array]
  const followUpPattern = /💡\s*(?:FOLLOW_UP_QUESTIONS|अनुवर्ती प्रश्न|पुढील प्रश्न):\s*\[([^\]]+)\]/i;
  const match = aiResponse.match(followUpPattern);
  
  if (match) {
    try {
      // Remove the follow-up section from the response
      cleanedResponse = aiResponse.replace(followUpPattern, '').trim();
      
      // Parse the JSON array of questions
      const questionsJson = `[${match[1]}]`;
      const parsedQuestions = JSON.parse(questionsJson);
      
      parsedQuestions.forEach((q: any, index: number) => {
        if (typeof q === 'string') {
          // Simple string format
          followUpQuestions.push({
            id: `ai-${index}`,
            text: q.trim(),
            category: detectCategory(q),
            emoji: getEmojiForCategory(detectCategory(q))
          });
        } else if (q.text) {
          // Object format with text property
          followUpQuestions.push({
            id: `ai-${index}`,
            text: q.text.trim(),
            category: q.category || detectCategory(q.text),
            emoji: q.emoji || getEmojiForCategory(q.category || detectCategory(q.text))
          });
        }
      });
    } catch (e) {
      console.log('⚠️ Could not parse AI follow-ups, using fallback');
    }
  }
  
  // If no AI-generated questions, generate smart contextual ones
  if (followUpQuestions.length === 0) {
    followUpQuestions.push(...generateSmartFollowUps(aiResponse, language));
  }
  
  return {
    cleanedResponse,
    followUpQuestions: followUpQuestions.slice(0, 3) // Max 3 questions
  };
}

/**
 * Generate smart follow-up questions based on response content
 * Focused on income doubling and yield improvement
 */
function generateSmartFollowUps(response: string, language: string): FollowUpQuestion[] {
  const questions: FollowUpQuestion[] = [];
  const lowerResponse = response.toLowerCase();
  
  // INCOME & YIELD FOCUSED questions
  const incomeQuestions: Record<string, FollowUpQuestion[]> = {
    en: [
      { id: 'inc1', text: 'How can I increase my yield by 2x?', category: 'yield', emoji: '📈' },
      { id: 'inc2', text: 'What is the expected income from this?', category: 'income', emoji: '💰' },
      { id: 'inc3', text: 'How much money can I save with this method?', category: 'savings', emoji: '🏦' }
    ],
    hi: [
      { id: 'inc1', text: 'उपज 2 गुना कैसे बढ़ाऊं?', category: 'yield', emoji: '📈' },
      { id: 'inc2', text: 'इससे कितनी कमाई होगी?', category: 'income', emoji: '💰' },
      { id: 'inc3', text: 'इस तरीके से कितना पैसा बचेगा?', category: 'savings', emoji: '🏦' }
    ],
    mr: [
      { id: 'inc1', text: 'उत्पादन 2 पट कसे वाढवू?', category: 'yield', emoji: '📈' },
      { id: 'inc2', text: 'यातून किती उत्पन्न मिळेल?', category: 'income', emoji: '💰' },
      { id: 'inc3', text: 'या पद्धतीने किती पैसे वाचतील?', category: 'savings', emoji: '🏦' }
    ]
  };
  
  // NEXT ACTION questions based on context
  const nextActionQuestions: Record<string, FollowUpQuestion[]> = {
    en: [
      { id: 'act1', text: 'What should I do first thing tomorrow?', category: 'next_action', emoji: '🎯' },
      { id: 'act2', text: 'Give me step-by-step plan for this week', category: 'next_action', emoji: '📋' }
    ],
    hi: [
      { id: 'act1', text: 'कल सबसे पहले क्या करूं?', category: 'next_action', emoji: '🎯' },
      { id: 'act2', text: 'इस हफ्ते की पूरी योजना दें', category: 'next_action', emoji: '📋' }
    ],
    mr: [
      { id: 'act1', text: 'उद्या सर्वात आधी काय करू?', category: 'next_action', emoji: '🎯' },
      { id: 'act2', text: 'या आठवड्याची संपूर्ण योजना द्या', category: 'next_action', emoji: '📋' }
    ]
  };
  
  // EXPERT TIP questions
  const expertQuestions: Record<string, FollowUpQuestion[]> = {
    en: [
      { id: 'exp1', text: 'What do top farmers do differently?', category: 'expert_tip', emoji: '🏆' },
      { id: 'exp2', text: 'Any advanced technique for better results?', category: 'expert_tip', emoji: '🔬' }
    ],
    hi: [
      { id: 'exp1', text: 'बड़े किसान क्या अलग करते हैं?', category: 'expert_tip', emoji: '🏆' },
      { id: 'exp2', text: 'कोई एडवांस तकनीक बताएं?', category: 'expert_tip', emoji: '🔬' }
    ],
    mr: [
      { id: 'exp1', text: 'यशस्वी शेतकरी वेगळे काय करतात?', category: 'expert_tip', emoji: '🏆' },
      { id: 'exp2', text: 'कोणती प्रगत तंत्रज्ञान सांगा?', category: 'expert_tip', emoji: '🔬' }
    ]
  };
  
  const lang = ['hi', 'mr', 'en'].includes(language) ? language : 'en';
  
  // Context-based selection
  if (lowerResponse.includes('fertilizer') || lowerResponse.includes('खाद') || lowerResponse.includes('खत')) {
    questions.push(incomeQuestions[lang][2]); // Savings question
    questions.push({
      id: 'fert1',
      text: lang === 'hi' ? 'सही मात्रा से उपज कितनी बढ़ेगी?' :
            lang === 'mr' ? 'योग्य प्रमाणाने उत्पादन किती वाढेल?' :
            'How much will yield increase with correct dosage?',
      category: 'yield',
      emoji: '📊'
    });
  }
  
  if (lowerResponse.includes('pest') || lowerResponse.includes('disease') || lowerResponse.includes('कीड') || lowerResponse.includes('किडा')) {
    questions.push({
      id: 'pest1',
      text: lang === 'hi' ? 'समय पर इलाज से कितना नुकसान बचेगा?' :
            lang === 'mr' ? 'वेळेवर उपचाराने किती नुकसान टळेल?' :
            'How much crop loss can I prevent with timely treatment?',
      category: 'savings',
      emoji: '💵'
    });
  }
  
  if (lowerResponse.includes('water') || lowerResponse.includes('irrigation') || lowerResponse.includes('पानी') || lowerResponse.includes('पाणी')) {
    questions.push({
      id: 'water1',
      text: lang === 'hi' ? 'ड्रिप से पानी और पैसे दोनों कैसे बचाऊं?' :
            lang === 'mr' ? 'ठिबकने पाणी आणि पैसे दोन्ही कसे वाचवू?' :
            'How to save both water and money with drip?',
      category: 'savings',
      emoji: '💧'
    });
  }
  
  // Always add income/yield question
  if (questions.length < 2) {
    questions.push(incomeQuestions[lang][0]);
  }
  
  // Always add next action
  if (questions.length < 3) {
    questions.push(nextActionQuestions[lang][0]);
  }
  
  return questions.slice(0, 3);
}

function detectCategory(text: string): 'income' | 'yield' | 'savings' | 'next_action' | 'expert_tip' {
  const lower = text.toLowerCase();
  
  if (lower.includes('income') || lower.includes('कमाई') || lower.includes('उत्पन्न') || lower.includes('पैसे')) {
    return 'income';
  }
  if (lower.includes('yield') || lower.includes('उपज') || lower.includes('उत्पादन') || lower.includes('बढ़ा') || lower.includes('वाढ')) {
    return 'yield';
  }
  if (lower.includes('save') || lower.includes('बचा') || lower.includes('वाच') || lower.includes('cost')) {
    return 'savings';
  }
  if (lower.includes('tomorrow') || lower.includes('कल') || lower.includes('उद्या') || lower.includes('next') || lower.includes('step')) {
    return 'next_action';
  }
  
  return 'expert_tip';
}

function getEmojiForCategory(category: string): string {
  const emojis: Record<string, string> = {
    income: '💰',
    yield: '📈',
    savings: '🏦',
    next_action: '🎯',
    expert_tip: '🏆'
  };
  return emojis[category] || '💡';
}

// Export the old function name for backward compatibility
export function generateFollowUpQuestions(
  aiResponse: string,
  userQuery: string,
  language: string,
  landContext?: any
): FollowUpQuestion[] {
  const { followUpQuestions } = parseAIGeneratedFollowUps(aiResponse, language);
  return followUpQuestions;
}
