import { ToastAction } from '@/components/ui/toast';

/**
 * The "share" button on a critical-alert toast: opens WhatsApp with the alert
 * text. Built here because the hook that raises the toast is plain TypeScript.
 */
export function shareAlertAction(label: string, spokenText: string, whatsappUrl: string) {
  return (
    <ToastAction altText={spokenText} onClick={() => window.open(whatsappUrl, '_blank')}>
      {label}
    </ToastAction>
  );
}
