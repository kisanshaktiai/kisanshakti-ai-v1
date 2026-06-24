import React from 'react';
import { 
  Camera, Sun, Ruler, Leaf, CheckCircle2, XCircle, 
  Image as ImageIcon, Info, Lightbulb
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

interface CropPhotoGuidelinesProps {
  collapsed?: boolean;
  className?: string;
}

export function CropPhotoGuidelines({ collapsed = true, className }: CropPhotoGuidelinesProps) {
  const { t, i18n } = useTranslation();

  const guidelines = {
    en: {
      title: 'Photo Tips for Best Results',
      tips: [
        { icon: Sun, text: 'Take photos in natural daylight (avoid harsh shadows)', good: true },
        { icon: Ruler, text: 'Get close to show leaf details (2-3 feet away)', good: true },
        { icon: Leaf, text: 'Include healthy and affected plant parts', good: true },
        { icon: Camera, text: 'Hold camera steady, avoid blurry images', good: true },
        { icon: ImageIcon, text: 'Take multiple angles if you see issues', good: true },
      ],
      avoid: [
        'Dark or nighttime photos',
        'Blurry or shaky images',
        'Photos from too far away',
        'Photos with heavy shadows',
      ],
      proTip: 'For best analysis, take 2-3 photos: one full plant view, one close-up of leaves, and one of any problem areas.',
    },
    hi: {
      title: 'सबसे अच्छे परिणामों के लिए फोटो टिप्स',
      tips: [
        { icon: Sun, text: 'प्राकृतिक रोशनी में फोटो लें (कड़ी छाया से बचें)', good: true },
        { icon: Ruler, text: 'पत्तियों का विवरण दिखाने के लिए करीब जाएं (2-3 फीट)', good: true },
        { icon: Leaf, text: 'स्वस्थ और प्रभावित पौधे के हिस्से शामिल करें', good: true },
        { icon: Camera, text: 'कैमरा स्थिर रखें, धुंधली तस्वीरों से बचें', good: true },
        { icon: ImageIcon, text: 'समस्या दिखे तो कई कोणों से फोटो लें', good: true },
      ],
      avoid: [
        'अंधेरी या रात की तस्वीरें',
        'धुंधली या हिली हुई तस्वीरें',
        'बहुत दूर से ली गई तस्वीरें',
        'गहरी छाया वाली तस्वीरें',
      ],
      proTip: 'सर्वोत्तम विश्लेषण के लिए 2-3 फोटो लें: एक पूर्ण पौधे का, एक पत्तियों का क्लोज-अप, और एक समस्या क्षेत्रों का।',
    },
    mr: {
      title: 'उत्तम निकालासाठी फोटो टिप्स',
      tips: [
        { icon: Sun, text: 'नैसर्गिक प्रकाशात फोटो घ्या (तीव्र सावल्या टाळा)', good: true },
        { icon: Ruler, text: 'पानांचे तपशील दाखवण्यासाठी जवळ जा (2-3 फूट)', good: true },
        { icon: Leaf, text: 'निरोगी आणि प्रभावित झाडाचे भाग समाविष्ट करा', good: true },
        { icon: Camera, text: 'कॅमेरा स्थिर धरा, धूसर प्रतिमा टाळा', good: true },
        { icon: ImageIcon, text: 'समस्या दिसल्यास अनेक कोनातून फोटो घ्या', good: true },
      ],
      avoid: [
        'अंधाऱ्या किंवा रात्रीच्या फोटो',
        'धूसर किंवा हलणारे फोटो',
        'खूप दूरून घेतलेले फोटो',
        'जास्त सावल्या असलेले फोटो',
      ],
      proTip: 'उत्तम विश्लेषणासाठी 2-3 फोटो घ्या: एक संपूर्ण झाडाचे, एक पानांचा क्लोज-अप, आणि एक समस्या असलेल्या भागाचा।',
    },
  };

  const currentLang = (i18n.language as 'en' | 'hi' | 'mr') || 'en';
  const content = guidelines[currentLang] || guidelines.en;

  return (
    <Card className={cn("border-primary/20 bg-primary/5", className)}>
      <Accordion type="single" collapsible defaultValue={collapsed ? undefined : "guidelines"}>
        <AccordionItem value="guidelines" className="border-none">
          <AccordionTrigger className="px-4 py-3 hover:no-underline">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Lightbulb className="h-4 w-4 text-primary" />
              {content.title}
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-4 pb-4">
            <div className="space-y-4">
              {/* Good practices */}
              <div className="space-y-2">
                {content.tips.map((tip, idx) => {
                  const Icon = tip.icon;
                  return (
                    <div key={idx} className="flex items-start gap-2 text-sm">
                      <CheckCircle2 className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                      <span>{tip.text}</span>
                    </div>
                  );
                })}
              </div>

              {/* What to avoid */}
              <div className="pt-2 border-t border-border/50">
                <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                  <XCircle className="h-3 w-3 text-destructive" />
                  {currentLang === 'hi' ? 'बचें:' : currentLang === 'mr' ? 'टाळा:' : 'Avoid:'}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {content.avoid.map((item, idx) => (
                    <Badge key={idx} variant="outline" className="text-xs font-normal text-destructive/80 border-destructive/30">
                      {item}
                    </Badge>
                  ))}
                </div>
              </div>

              {/* Pro tip */}
              <div className="bg-primary/10 rounded-lg p-3 border border-primary/20">
                <div className="flex items-start gap-2">
                  <Info className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                  <p className="text-xs text-foreground">{content.proTip}</p>
                </div>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </Card>
  );
}
