/**
 * GeneralChatLandPicker — 2030-ready bottom sheet
 *
 * Shown on the General chat tab after the farmer types their first question.
 * Lets them attach a specific land as authoritative context for the direct-LLM
 * senior-agronomist answer, or explicitly continue as a general question.
 *
 * 100% theme-token driven (no hardcoded colors). Mobile-first.
 */

import { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sprout,
  MapPin,
  Wheat,
  Ruler,
  CheckCircle2,
  Globe2,
  X,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

export interface PickerLand {
  id: string;
  name: string;
  current_crop?: string | null;
  crop_name?: string | null;
  area_hectares?: number | null;
  district?: string | null;
  growth_stage?: string | null;
}

interface Props {
  open: boolean;
  lands: PickerLand[];
  onPick: (landId: string | null) => void;
  onClose: () => void;
}

export default function GeneralChatLandPicker({ open, lands, onPick, onClose }: Props) {
  const { t } = useTranslation('chat');

  const sortedLands = useMemo(
    () => [...(lands || [])].sort((a, b) => (a.name || '').localeCompare(b.name || '')),
    [lands],
  );

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent
        side="bottom"
        className="p-0 rounded-t-3xl border-t border-border/40 bg-background max-h-[85vh] overflow-hidden"
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-2">
          <div className="h-1.5 w-10 rounded-full bg-muted-foreground/30" />
        </div>

        {/* Hero header with subtle gradient using semantic tokens */}
        <div className="relative px-5 pb-4">
          <div
            aria-hidden
            className="absolute inset-x-0 -top-2 h-32 opacity-60 pointer-events-none"
            style={{
              background:
                'radial-gradient(120% 80% at 50% 0%, hsl(var(--primary) / 0.18) 0%, transparent 70%)',
            }}
          />
          <SheetHeader className="relative text-left">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <div className="absolute inset-0 rounded-2xl bg-primary/20 blur-md" />
                  <div className="relative h-11 w-11 rounded-2xl bg-gradient-to-br from-primary to-primary/70 grid place-items-center shadow-lg">
                    <Sprout className="h-5 w-5 text-primary-foreground" />
                  </div>
                </div>
                <div>
                  <SheetTitle className="text-base font-semibold leading-tight">
                    {t('general.pick_land_title', 'Pick a land for context')}
                  </SheetTitle>
                  <SheetDescription className="text-[11px] text-muted-foreground mt-0.5">
                    {t(
                      'general.pick_land_subtitle',
                      'Attach a land so the agronomist tailors advice to your crop & stage.',
                    )}
                  </SheetDescription>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-full"
                onClick={onClose}
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </SheetHeader>
        </div>

        {/* "General question" featured card */}
        <div className="px-5 pb-3">
          <motion.button
            whileTap={{ scale: 0.98 }}
            onClick={() => onPick(null)}
            className={cn(
              'group relative w-full overflow-hidden rounded-2xl border border-border/60 bg-card',
              'p-4 text-left shadow-sm hover:border-primary/50 hover:shadow-md transition-all',
            )}
          >
            <div
              aria-hidden
              className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-accent/20 blur-2xl"
            />
            <div className="relative flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-accent/15 grid place-items-center text-accent-foreground">
                <Globe2 className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-foreground">
                  {t('general.no_specific_land', 'No specific land — general question')}
                </div>
                <div className="text-[11px] text-muted-foreground mt-0.5">
                  {t(
                    'general.no_specific_land_hint',
                    'Best for season planning, scheme info, market trends.',
                  )}
                </div>
              </div>
              <CheckCircle2 className="h-5 w-5 text-muted-foreground/50 group-hover:text-primary transition-colors" />
            </div>
          </motion.button>
        </div>

        {/* Divider with label */}
        {sortedLands.length > 0 && (
          <div className="px-5 pb-2 flex items-center gap-3">
            <div className="h-px flex-1 bg-border/60" />
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
              {t('general.or_pick_land', 'Or pick a land')}
            </span>
            <div className="h-px flex-1 bg-border/60" />
          </div>
        )}

        {/* Land cards */}
        <ScrollArea className="max-h-[45vh] px-5 pb-6">
          <AnimatePresence>
            <div className="grid grid-cols-1 gap-2.5">
              {sortedLands.map((l, idx) => {
                const crop = l.current_crop || l.crop_name;
                return (
                  <motion.button
                    key={l.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.03 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => onPick(l.id)}
                    className={cn(
                      'group relative w-full overflow-hidden rounded-2xl border border-border/60 bg-card',
                      'p-3.5 text-left transition-all',
                      'hover:border-primary/60 hover:shadow-md active:bg-muted/30',
                    )}
                  >
                    {/* Left accent bar */}
                    <div
                      aria-hidden
                      className="absolute left-0 top-3 bottom-3 w-1 rounded-r-full bg-gradient-to-b from-primary to-primary/40"
                    />

                    <div className="pl-2 flex items-start gap-3">
                      <div className="h-10 w-10 shrink-0 rounded-xl bg-primary/10 grid place-items-center text-primary">
                        <MapPin className="h-5 w-5" />
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-foreground truncate">
                            {l.name}
                          </span>
                          {l.growth_stage && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-success/15 text-success border border-success/20">
                              {l.growth_stage}
                            </span>
                          )}
                        </div>

                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                          {crop && (
                            <span className="inline-flex items-center gap-1">
                              <Wheat className="h-3 w-3 text-primary/70" />
                              <span className="truncate max-w-[120px]">{crop}</span>
                            </span>
                          )}
                          {l.area_hectares != null && (
                            <span className="inline-flex items-center gap-1">
                              <Ruler className="h-3 w-3" />
                              {l.area_hectares} ha
                            </span>
                          )}
                          {l.district && (
                            <span className="inline-flex items-center gap-1">
                              <MapPin className="h-3 w-3" />
                              <span className="truncate max-w-[100px]">{l.district}</span>
                            </span>
                          )}
                        </div>
                      </div>

                      <CheckCircle2 className="h-5 w-5 text-muted-foreground/40 group-hover:text-primary transition-colors shrink-0 mt-1" />
                    </div>
                  </motion.button>
                );
              })}
            </div>
          </AnimatePresence>

          {sortedLands.length === 0 && (
            <div className="text-center py-6 text-xs text-muted-foreground">
              {t('general.no_lands_yet', 'No lands added yet — continuing as general question.')}
            </div>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
