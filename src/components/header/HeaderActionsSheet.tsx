import { useState } from 'react';
import { MoreHorizontal, Wifi, RefreshCw, Languages } from 'lucide-react';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@/components/ui/drawer';
import { ConnectionStatusIcon } from '@/components/ConnectionStatusIcon';
import { SyncButton } from '@/components/sync/SyncButton';
import { LanguageSelector } from '@/components/LanguageSelector';
import { useTranslation } from 'react-i18next';

/**
 * Single "More" glass button that opens a bottom sheet with all header actions.
 * Frees ~100px on 390px screens vs three stacked icons.
 */
export function HeaderActionsSheet() {
  const [open, setOpen] = useState(false);
  const { t } = useTranslation();

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger asChild>
        <button
          aria-label={t('common.more', 'More actions')}
          className="flex items-center justify-center h-10 w-10 rounded-full bg-card/80 border border-border/60 shadow-sm hover:bg-accent/50 active:scale-95 transition-all"
        >
          <MoreHorizontal className="h-5 w-5 text-foreground" />
        </button>
      </DrawerTrigger>
      <DrawerContent className="px-4 pb-6">
        <DrawerHeader className="px-0">
          <DrawerTitle className="text-base">{t('common.quickActions', 'Quick Actions')}</DrawerTitle>
        </DrawerHeader>
        <div className="grid grid-cols-1 gap-2 mt-2">
          <ActionRow
            icon={<Wifi className="h-5 w-5 text-primary" />}
            label={t('common.connection', 'Connection')}
            control={<ConnectionStatusIcon />}
          />
          <ActionRow
            icon={<RefreshCw className="h-5 w-5 text-primary" />}
            label={t('common.sync', 'Sync data')}
            control={<SyncButton />}
          />
          <ActionRow
            icon={<Languages className="h-5 w-5 text-primary" />}
            label={t('common.language', 'Language')}
            control={<LanguageSelector />}
          />
        </div>
      </DrawerContent>
    </Drawer>
  );
}

function ActionRow({
  icon,
  label,
  control,
}: {
  icon: React.ReactNode;
  label: string;
  control: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-muted/40 border border-border/40">
      <div className="flex items-center gap-3 min-w-0">
        <div className="shrink-0 h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
          {icon}
        </div>
        <span className="text-sm font-medium text-foreground truncate">{label}</span>
      </div>
      <div className="shrink-0">{control}</div>
    </div>
  );
}
