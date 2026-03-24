import { motion } from 'framer-motion';
import { Home, MapPin, Cloud, Calendar, MessageSquare, ShoppingBag, User, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

interface QuickAction {
  icon: React.ReactNode;
  label: Record<string, string>;
  command: Record<string, string>;
  route: string;
}

const quickActions: QuickAction[] = [
  {
    icon: <Home className="h-5 w-5" />,
    label: { en: 'Home', hi: 'होम', mr: 'होम', ta: 'முகப்பு', pa: 'ਘਰ' },
    command: { en: 'go home', hi: 'घर जाओ', mr: 'घरी जा', ta: 'வீட்டிற்கு செல்', pa: 'ਘਰ ਜਾਓ' },
    route: '/app'
  },
  {
    icon: <MapPin className="h-5 w-5" />,
    label: { en: 'My Lands', hi: 'मेरी जमीन', mr: 'माझी जमीन', ta: 'என் நிலங்கள்', pa: 'ਮੇਰੀ ਜ਼ਮੀਨ' },
    command: { en: 'show my lands', hi: 'मेरी जमीन दिखाओ', mr: 'माझी जमीन दाखवा', ta: 'என் நிலங்களை காட்டு', pa: 'ਮੇਰੀ ਜ਼ਮੀਨ ਦਿਖਾਓ' },
    route: '/app/lands'
  },
  {
    icon: <Cloud className="h-5 w-5" />,
    label: { en: 'Weather', hi: 'मौसम', mr: 'हवामान', ta: 'வானிலை', pa: 'ਮੌਸਮ' },
    command: { en: 'show weather', hi: 'मौसम दिखाओ', mr: 'हवामान दाखवा', ta: 'வானிலையை காட்டு', pa: 'ਮੌਸਮ ਦਿਖਾਓ' },
    route: '/app/weather'
  },
  {
    icon: <Calendar className="h-5 w-5" />,
    label: { en: 'Schedule', hi: 'कार्यक्रम', mr: 'वेळापत्रक', ta: 'அட்டவணை', pa: 'ਕਾਰਜਕ੍ਰਮ' },
    command: { en: 'show schedule', hi: 'कार्यक्रम दिखाओ', mr: 'वेळापत्रक दाखवा', ta: 'அட்டவணையை காட்டு', pa: 'ਕਾਰਜਕ੍ਰਮ ਦਿਖਾਓ' },
    route: '/app/schedule'
  },
  {
    icon: <MessageSquare className="h-5 w-5" />,
    label: { en: 'AI Chat', hi: 'एआई चैट', mr: 'एआय चॅट', ta: 'ஏஐ அரட்டை', pa: 'AI ਚੈਟ' },
    command: { en: 'open chat', hi: 'चैट खोलो', mr: 'चॅट उघडा', ta: 'அரட்டையை திற', pa: 'ਚੈਟ ਖੋਲ੍ਹੋ' },
    route: '/app/chat'
  },
  {
    icon: <ShoppingBag className="h-5 w-5" />,
    label: { en: 'Market', hi: 'बाजार', mr: 'बाजार', ta: 'சந்தை', pa: 'ਬਾਜ਼ਾਰ' },
    command: { en: 'open market', hi: 'बाजार खोलो', mr: 'बाजार उघडा', ta: 'சந்தையை திற', pa: 'ਬਾਜ਼ਾਰ ਖੋਲ੍ਹੋ' },
    route: '/app/market'
  },
  {
    icon: <User className="h-5 w-5" />,
    label: { en: 'Profile', hi: 'प्रोफ़ाइल', mr: 'प्रोफाइल', ta: 'விவரக்குறிப்பு', pa: 'ਪ੍ਰੋਫਾਈਲ' },
    command: { en: 'my profile', hi: 'मेरी प्रोफ़ाइल', mr: 'माझे प्रोफाइल', ta: 'என் விவரக்குறிப்பு', pa: 'ਮੇਰੀ ਪ੍ਰੋਫਾਈਲ' },
    route: '/app/profile'
  },
  {
    icon: <Users className="h-5 w-5" />,
    label: { en: 'Community', hi: 'समुदाय', mr: 'समुदाय', ta: 'சமூகம்', pa: 'ਕਮਿਊਨਿਟੀ' },
    command: { en: 'open community', hi: 'समुदाय खोलो', mr: 'समुदाय उघडा', ta: 'சமூகத்தை திற', pa: 'ਕਮਿਊਨਿਟੀ ਖੋਲ੍ਹੋ' },
    route: '/app/community'
  }
];

interface VoiceQuickActionsProps {
  language: string;
  onActionClick: (route: string, command: string) => void;
}

export function VoiceQuickActions({ language, onActionClick }: VoiceQuickActionsProps) {
  return (
    <Card className="p-4">
      <h3 className="text-sm font-semibold mb-4">Quick Voice Commands</h3>
      <div className="grid grid-cols-2 gap-2">
        {quickActions.map((action, index) => (
          <motion.div
            key={action.route}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05 }}
          >
            <Button
              variant="outline"
              className="w-full justify-start gap-2 h-auto py-3"
              onClick={() => onActionClick(action.route, action.command[language] || action.command.en)}
            >
              {action.icon}
              <div className="flex flex-col items-start text-left">
                <span className="text-sm font-medium">
                  {action.label[language] || action.label.en}
                </span>
                <span className="text-xs text-muted-foreground">
                  "{action.command[language] || action.command.en}"
                </span>
              </div>
            </Button>
          </motion.div>
        ))}
      </div>
    </Card>
  );
}