import { motion } from 'framer-motion';
import { CheckCircle2, ArrowRight, Sparkles } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { VisuallyHidden } from '@radix-ui/react-visually-hidden';

// Localized "You selected {language}" + "Continue" labels for every supported language.
// Kept inline to guarantee no missing-key flash for languages without full bundles.
const LOCALIZED: Record<string, { selected: (name: string) => string; continue: string }> = {
  en: { selected: (n) => `You selected ${n}`, continue: 'Continue' },
  hi: { selected: (n) => `आपने ${n} चुनी है`, continue: 'आगे बढ़ें' },
  mr: { selected: (n) => `तुम्ही ${n} निवडली आहे`, continue: 'पुढे जा' },
  pa: { selected: (n) => `ਤੁਸੀਂ ${n} ਚੁਣੀ ਹੈ`, continue: 'ਅੱਗੇ ਵਧੋ' },
  ta: { selected: (n) => `நீங்கள் ${n} தேர்ந்தெடுத்துள்ளீர்கள்`, continue: 'தொடரவும்' },
  te: { selected: (n) => `మీరు ${n} ఎంచుకున్నారు`, continue: 'కొనసాగించు' },
  bn: { selected: (n) => `আপনি ${n} নির্বাচন করেছেন`, continue: 'এগিয়ে যান' },
  gu: { selected: (n) => `તમે ${n} પસંદ કરી છે`, continue: 'આગળ વધો' },
  kn: { selected: (n) => `ನೀವು ${n} ಆಯ್ಕೆ ಮಾಡಿದ್ದೀರಿ`, continue: 'ಮುಂದುವರಿಯಿರಿ' },
  ml: { selected: (n) => `നിങ്ങൾ ${n} തിരഞ്ഞെടുത്തു`, continue: 'തുടരുക' },
  or: { selected: (n) => `ଆପଣ ${n} ଚୟନ କରିଛନ୍ତି`, continue: 'ଆଗକୁ ବଢ଼ନ୍ତୁ' },
  as: { selected: (n) => `আপুনি ${n} বাছনি কৰিছে`, continue: 'আগবাঢ়ক' },
  ur: { selected: (n) => `آپ نے ${n} منتخب کی ہے`, continue: 'جاری رکھیں' },
  sa: { selected: (n) => `भवता ${n} चयनिता`, continue: 'अग्रे गच्छतु' },
};

interface Props {
  open: boolean;
  langCode: string;
  nativeName: string;
  englishName: string;
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
}

export function LanguageConfirmDialog({
  open, langCode, nativeName, englishName, onConfirm, onOpenChange,
}: Props) {
  const loc = LOCALIZED[langCode] ?? LOCALIZED.en;
  const en = LOCALIZED.en;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-[340px] rounded-3xl border-2 border-primary/20 bg-card p-0 overflow-hidden"
        aria-describedby={undefined}
      >
        <VisuallyHidden>
          <DialogTitle>{en.selected(englishName)}</DialogTitle>
          <DialogDescription>{loc.selected(nativeName)}</DialogDescription>
        </VisuallyHidden>

        <div className="relative bg-gradient-to-br from-primary/15 via-primary/5 to-background px-6 pt-8 pb-6 text-center">
          <motion.div
            initial={{ scale: 0, rotate: -45 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 18 }}
            className="mx-auto mb-4 w-16 h-16 rounded-full bg-primary/15 flex items-center justify-center"
          >
            <CheckCircle2 className="w-9 h-9 text-primary" aria-hidden="true" />
          </motion.div>

          <motion.p
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-base font-semibold text-foreground"
          >
            {loc.selected(nativeName)}
          </motion.p>
          <motion.p
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.18 }}
            className="mt-1 text-sm text-muted-foreground"
          >
            {en.selected(englishName)}
          </motion.p>
        </div>

        <div className="px-5 pb-5 pt-2">
          <Button
            onClick={onConfirm}
            variant="pill-gradient"
            size="lg"
            className="w-full group"
            aria-label={`${loc.continue} / ${en.continue}`}
          >
            <span className="text-base font-semibold">{loc.continue}</span>
            <span className="mx-2 opacity-50">·</span>
            <span className="text-sm opacity-90">{en.continue}</span>
            <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-0.5 transition-transform" aria-hidden="true" />
            <Sparkles className="w-4 h-4 ml-1 opacity-70" aria-hidden="true" />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
