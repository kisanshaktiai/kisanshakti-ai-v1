// ============= CONVERSATION MEMORY COMPRESSOR =============
// Reduces conversation history tokens by 80-95%

interface Message {
  role: string;
  content: string;
}

interface CompressedMemory {
  context: string;
  recentMessages: Message[];
  tokenEstimate: number;
}

export function compressConversationMemory(
  messages: Message[],
  cropName: string,
  areaAcres: string | number,
  currentStage?: string
): CompressedMemory {
  const messageCount = messages.length;
  
  // First message: No history needed
  if (messageCount <= 1) {
    return {
      context: '',
      recentMessages: messages,
      tokenEstimate: 0
    };
  }
  
  // Messages 2-3: Mini context refresh
  if (messageCount <= 3) {
    const lastUserMsg = messages.filter(m => m.role === 'user').pop();
    const lastTopic = extractTopic(lastUserMsg?.content || '');
    
    return {
      context: `[पिछला विषय: ${lastTopic}]`,
      recentMessages: messages.slice(-2),
      tokenEstimate: 50
    };
  }
  
  // Messages 4+: Compressed summary + last 2 only
  const summary = generateConversationSummary(messages, cropName, areaAcres, currentStage);
  
  return {
    context: summary,
    recentMessages: messages.slice(-2),
    tokenEstimate: 100
  };
}

function extractTopic(message: string): string {
  const lowerMsg = message.toLowerCase();
  
  if (/पानी|सिंचाई|water|irrigation/.test(lowerMsg)) return 'सिंचाई';
  if (/खाद|fertilizer|urea|dap/.test(lowerMsg)) return 'खाद';
  if (/कीट|रोग|pest|disease/.test(lowerMsg)) return 'कीट/रोग';
  if (/बाजार|market|price/.test(lowerMsg)) return 'बाजार';
  if (/मौसम|weather/.test(lowerMsg)) return 'मौसम';
  if (/ndvi|health|स्वास्थ्य/.test(lowerMsg)) return 'फसल स्वास्थ्य';
  
  return 'सामान्य';
}

function generateConversationSummary(
  messages: Message[],
  cropName: string,
  areaAcres: string | number,
  currentStage?: string
): string {
  // Extract key topics discussed
  const userMessages = messages.filter(m => m.role === 'user');
  const topics = new Set<string>();
  
  userMessages.forEach(m => {
    topics.add(extractTopic(m.content));
  });
  
  const topicList = Array.from(topics).slice(0, 3).join(', ');
  
  // Generate compact summary
  const stage = currentStage ? ` | अवस्था: ${currentStage}` : '';
  return `[संदर्भ: ${cropName} ${areaAcres}एकड़${stage} | चर्चा: ${topicList}]`;
}

// Build optimized messages array for API call
export function buildOptimizedMessages(
  systemPrompt: string,
  compressedMemory: CompressedMemory,
  currentMessage: string
): Message[] {
  const messages: Message[] = [
    { role: 'system', content: systemPrompt }
  ];
  
  // Add compressed context if exists
  if (compressedMemory.context) {
    messages.push({
      role: 'system',
      content: compressedMemory.context
    });
  }
  
  // Add recent messages (max 2 from history)
  compressedMemory.recentMessages.forEach(m => {
    if (m.content !== currentMessage) {
      messages.push(m);
    }
  });
  
  // Add current user message
  messages.push({ role: 'user', content: currentMessage });
  
  return messages;
}

// Estimate total tokens for monitoring
export function estimateTotalTokens(messages: Message[]): number {
  let total = 0;
  messages.forEach(m => {
    // Rough: 1 token ≈ 3 chars for mixed Hindi/English
    total += Math.ceil(m.content.length / 3);
  });
  return total;
}
