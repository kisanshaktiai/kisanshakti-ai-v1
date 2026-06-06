import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Sprout, Leaf, ArrowRight, Recycle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { getPostHarvestSuggestion } from '@/lib/harvest/postHarvestSuggestions';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prevCrop: string | null;
  landId: string | null;
  landName?: string | null;
}

/**
 * Step 7 + 8 — Shown after a successful harvest confirmation.
 *
 * - Residue management tip for the family of the harvested crop (Step 7).
 * - 2-3 next-crop suggestions with reason chips (Step 7).
 * - One-tap "Plan this crop" button that routes to the existing Schedule
 *   flow with the land pre-selected via router state (Step 8).
 */
export function PostHarvestSuggestionDialog({
  open,
  onOpenChange,
  prevCrop,
  landId,
  landName,
}: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const profile = getPostHarvestSuggestion(prevCrop);

  const plan = (crop: string) => {
    onOpenChange(false);
    navigate('/app/schedule', {
      state: {
        preselectedLandId: landId,
        suggestedCrop: crop,
        source: 'post-harvest',
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md bg-background">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sprout className="h-5 w-5 text-primary" />
            {t('schedule.harvest.next.title', "What's next for this land?")}
          </DialogTitle>
          <DialogDescription>
            {landName
              ? t('schedule.harvest.next.land_subtitle', '{{land}} • after {{crop}}', {
                  land: landName,
                  crop: prevCrop || '',
                })
              : t('schedule.harvest.next.subtitle', 'After {{crop}}', { crop: prevCrop || '' })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Residue tip */}
          <Card className="p-3 bg-success-soft/40 border-success/30">
            <div className="flex items-start gap-2">
              <Recycle className="h-4 w-4 text-success shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-xs font-semibold text-foreground mb-0.5">
                  {t('schedule.harvest.next.residue_label', 'Residue tip')}
                </p>
                <p className="text-xs text-muted-foreground leading-snug">
                  {t(
                    `schedule.harvest.next.${profile.residue_tip_key}`,
                    defaultResidueTip(profile.residue_tip_key),
                  )}
                </p>
              </div>
            </div>
          </Card>

          {/* Suggestions */}
          <div>
            <p className="text-xs font-semibold text-foreground mb-2 flex items-center gap-1.5">
              <Leaf className="h-3.5 w-3.5 text-primary" />
              {t('schedule.harvest.next.suggestions_label', 'Suggested next crops')}
            </p>
            <div className="space-y-2">
              {profile.suggestions.map((s) => (
                <Card
                  key={s.crop}
                  className="p-3 flex items-center gap-3 bg-card border-border/60"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground">{s.crop}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {t(
                        `schedule.harvest.next.${s.reason_key}`,
                        defaultReason(s.reason_key),
                      )}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => plan(s.crop)}
                    disabled={!landId}
                    className="shrink-0"
                  >
                    {t('schedule.harvest.next.plan', 'Plan')}
                    <ArrowRight className="ml-1 h-3.5 w-3.5" />
                  </Button>
                </Card>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t('schedule.harvest.next.later', 'Maybe later')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Fallback English copy if i18n key isn't present yet.
function defaultResidueTip(key: string): string {
  switch (key) {
    case 'residue.sugarcane':
      return 'Chop the trash and mulch in place. Do not burn — it kills soil microbes.';
    case 'residue.rice':
      return 'Incorporate paddy stubble with a decomposer; avoid burning to protect air and soil.';
    case 'residue.cereal':
      return 'Shred straw and incorporate or mulch. Adds organic carbon to soil.';
    case 'residue.legume':
      return 'Leave roots in the soil — they release nitrogen for the next crop.';
    case 'residue.cotton':
      return 'Shred cotton stalks and compost. Remove root stubble to break pest cycle.';
    case 'residue.veg':
      return 'Clear plant debris and compost. Solarize the bed for 2 weeks before planting.';
    default:
      return 'Add crop residue to compost. Avoid burning to keep soil healthy.';
  }
}

function defaultReason(key: string): string {
  switch (key) {
    case 'rotation.fixes_nitrogen':
      return 'Fixes nitrogen — cuts next-season fertilizer cost.';
    case 'rotation.uses_residual_n':
      return 'Uses leftover nitrogen from the previous crop.';
    case 'rotation.breaks_pest_cycle':
      return 'Breaks pest & disease cycle of the previous crop.';
    case 'rotation.different_root_depth':
      return 'Different root depth — improves soil structure.';
    case 'rotation.different_family':
      return 'Different crop family — reduces soil-borne disease.';
    case 'rotation.classic_pair':
      return 'Classic rotation pair — proven yield improvement.';
    case 'rotation.summer_alt':
      return 'Good summer alternative for this land.';
    default:
      return 'Recommended rotation.';
  }
}
