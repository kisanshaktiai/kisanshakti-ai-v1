import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { CheckCircle, XCircle } from 'lucide-react';

interface VoiceConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmText?: string;
  cancelText?: string;
  language?: string;
}

const translations: Record<string, { yes: string; no: string }> = {
  'en': { yes: 'Yes', no: 'No' },
  'hi': { yes: 'हाँ', no: 'नहीं' },
  'mr': { yes: 'होय', no: 'नाही' },
  'ta': { yes: 'ஆம்', no: 'இல்லை' },
  'pa': { yes: 'ਹਾਂ', no: 'ਨਹੀਂ' },
  'te': { yes: 'అవును', no: 'కాదు' },
  'bn': { yes: 'হ্যাঁ', no: 'না' },
  'ml': { yes: 'അതെ', no: 'ഇല്ല' },
  'gu': { yes: 'હા', no: 'ના' },
  'kn': { yes: 'ಹೌದು', no: 'ಇಲ್ಲ' },
  'or': { yes: 'ହଁ', no: 'ନା' },
  'as': { yes: 'হয়', no: 'নহয়' },
  'ur': { yes: 'ہاں', no: 'نہیں' },
  'sa': { yes: 'आम्', no: 'न' }
};

export function VoiceConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  onConfirm,
  onCancel,
  confirmText,
  cancelText,
  language = 'en'
}: VoiceConfirmDialogProps) {
  const t = translations[language] || translations['en'];

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            {title}
          </AlertDialogTitle>
          <AlertDialogDescription className="text-base">
            {description}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-row gap-2 sm:gap-2">
          <AlertDialogCancel 
            onClick={onCancel}
            className="flex-1 gap-2"
          >
            <XCircle className="h-4 w-4" />
            {cancelText || t.no}
          </AlertDialogCancel>
          <AlertDialogAction 
            onClick={onConfirm}
            className="flex-1 gap-2"
          >
            <CheckCircle className="h-4 w-4" />
            {confirmText || t.yes}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}