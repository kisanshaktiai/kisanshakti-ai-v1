// ============= COLOR-CODED RESPONSE PARSER =============

export interface ResponseCard {
  id: string;
  type: 'organic' | 'fertilizer' | 'pesticide' | 'warning' | 'success' | 'info' | 'hormone' | 'irrigation';
  title: string;
  content: string;
  color: string;
  gradient: string[];
  icon: string;
  priority: number;
}

export interface StructuredResponse {
  cards: ResponseCard[];
  language: string;
}

const CARD_THEMES = {
  organic: {
    color: '#10B981',
    gradient: ['#059669', '#10B981', '#34D399'],
    icon: '🟢',
    priority: 3
  },
  fertilizer: {
    color: '#F59E0B',
    gradient: ['#D97706', '#F59E0B', '#FBBF24'],
    icon: '🟡',
    priority: 3
  },
  pesticide: {
    color: '#EF4444',
    gradient: ['#DC2626', '#EF4444', '#F87171'],
    icon: '🔴',
    priority: 2
  },
  hormone: {
    color: '#8B5CF6',
    gradient: ['#7C3AED', '#8B5CF6', '#A78BFA'],
    icon: '🟣',
    priority: 3
  },
  irrigation: {
    color: '#06B6D4',
    gradient: ['#0891B2', '#06B6D4', '#22D3EE'],
    icon: '🔵',
    priority: 3
  },
  warning: {
    color: '#F97316',
    gradient: ['#EA580C', '#F97316', '#FB923C'],
    icon: '⚠️',
    priority: 1
  },
  success: {
    color: '#22C55E',
    gradient: ['#16A34A', '#22C55E', '#4ADE80'],
    icon: '✅',
    priority: 4
  },
  info: {
    color: '#3B82F6',
    gradient: ['#2563EB', '#3B82F6', '#60A5FA'],
    icon: 'ℹ️',
    priority: 4
  }
};

// Helper function to clean markdown formatting
function cleanMarkdown(text: string): string {
  return text
    // Remove ** for bold
    .replace(/\*\*(.*?)\*\*/g, '$1')
    // Remove * for italic
    .replace(/\*(.*?)\*/g, '$1')
    // Remove ## headers
    .replace(/^#{1,6}\s+/gm, '')
    // Remove --- separators
    .replace(/^-{3,}$/gm, '')
    // Clean up multiple spaces
    .replace(/\s+/g, ' ')
    .trim();
}

// Helper function to format content with proper line breaks
function formatContentWithLineBreaks(content: string): string {
  // ✅ Step 1: Remove markdown formatting
  let formatted = content
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/^#{1,6}\s+/gm, '');
  
  // ✅ Step 2: Force newlines before numbered points
  formatted = formatted
    .replace(/([^\n\d])(\d+\.)\s+/g, '$1\n$2 ')  // "text1. text" -> "text\n1. text"
    .replace(/([^\n])([१२३४५६७८९०]+\.)\s+/g, '$1\n$2 ')  // Hindi numbered lists
    .replace(/([^\n])([•·\-\*])\s+(?=[A-Za-z\u0900-\u097F])/g, '$1\n$2 ');  // Bullet points
  
  // ✅ Step 3: Ensure emoji section markers start on new line with spacing
  formatted = formatted.replace(/([^\n])(🟢|🟡|🔴|🟣|🔵|⚠️|✅|ℹ️|🌱|💧|🌾|📅|🎯|💰|📊|🏦|💵)/g, '$1\n\n$2');
  
  // ✅ Step 4: Add spacing after colons that precede text (section dividers)
  formatted = formatted.replace(/([।:])(\s*)(?=[A-Za-z\u0900-\u097F])/g, '$1\n');
  
  // ✅ Step 5: Clean up excessive newlines
  formatted = formatted
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\n+/, '')
    .trim();
  
  return formatted;
}

export function parseResponseToCards(aiResponse: string, language: string): StructuredResponse {
  const cards: ResponseCard[] = [];
  
  // Split by emoji markers
  const sections = aiResponse.split(/(?=🟢|🟡|🔴|🟣|🔵|⚠️|✅|ℹ️)/);
  
  for (const section of sections) {
    if (!section.trim()) continue;
    
    let cardType: keyof typeof CARD_THEMES = 'info';
    
    // Identify card type by emoji and keywords
    if (section.startsWith('🟢')) {
      const lowerSection = section.toLowerCase();
      if (lowerSection.includes('organic') || lowerSection.includes('जैविक') || 
          lowerSection.includes('प्राकृतिक') || lowerSection.includes('natural') ||
          lowerSection.includes('सेंद्रिय')) {
        cardType = 'organic';
      }
    } else if (section.startsWith('🟡')) {
      cardType = 'fertilizer';
    } else if (section.startsWith('🔴')) {
      cardType = 'pesticide';
    } else if (section.startsWith('🟣')) {
      cardType = 'hormone';
    } else if (section.startsWith('🔵')) {
      cardType = 'irrigation';
    } else if (section.startsWith('⚠️')) {
      cardType = 'warning';
    } else if (section.startsWith('✅')) {
      cardType = 'success';
    }
    
    // Extract title and content
    const lines = section.trim().split('\n');
    const titleLine = lines[0].replace(/^[🟢🟡🔴🟣🔵⚠️✅ℹ️]\s*/, '').trim();
    const title = cleanMarkdown(titleLine);
    const rawContent = lines.slice(1).join('\n').trim();
    const content = formatContentWithLineBreaks(rawContent);
    
    if (title && content) {
      cards.push({
        id: `card-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        type: cardType,
        title,
        content,
        ...CARD_THEMES[cardType]
      });
    }
  }
  
  // Sort by priority (warnings first)
  cards.sort((a, b) => a.priority - b.priority);
  
  return {
    cards,
    language
  };
}
