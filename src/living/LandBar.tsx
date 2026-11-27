import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Check, ChevronDown, MapPinned, Plus, Sprout } from 'lucide-react';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { WorkspaceSwitcher } from '@/components/identity/WorkspaceSwitcher';
import { useCropNames } from '@/hooks/useCropNames';

export interface BarLand { id: string; name?: string | null; current_crop?: string | null; current_crop_id?: string | null }

/** Top row of a Living Farm screen: role picture (people with several roles), the land chip with its picker, and add-land. */
export function LandBar({ lands, land, onChoose }: { lands: BarLand[]; land: BarLand | null; onChoose: (id: string) => void }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const cropNameOf = useCropNames();
  const [open, setOpen] = useState(false);

  const cropOf = (l: BarLand) => (l.current_crop ? cropNameOf(l.current_crop, l.current_crop_id) : null);
  const label = land ? [land.name || t('home.unnamed_land'), cropOf(land)].filter(Boolean).join(' · ') : t('living.brief.no_land');

  return (
    <div className="lf-top">
      <WorkspaceSwitcher variant="header" />
      <button type="button" className="lf-landsel" aria-haspopup={lands.length > 1 ? 'dialog' : undefined}
        onClick={() => (lands.length > 1 ? setOpen(true) : navigate(land ? `/app/lands/${land.id}` : '/app/lands/add'))}>
        <MapPinned size={18} aria-hidden className="shrink-0 text-primary" />
        <span>{label}</span>
        {lands.length > 1 && <ChevronDown size={18} aria-hidden className="shrink-0" />}
      </button>
      <button type="button" className="lf-round bg-card border border-border" aria-label={t('living.add_land')} onClick={() => navigate('/app/lands/add')}>
        <Plus size={22} aria-hidden />
      </button>

      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerContent>
          <DrawerHeader><DrawerTitle className="lf-head">{t('home.myLand')}</DrawerTitle></DrawerHeader>
          <div className="lf-sheet-scroll flex flex-col gap-2 overflow-y-auto px-4" style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}>
            {lands.map((l) => {
              const selected = l.id === land?.id;
              return (
                <button key={l.id} type="button" onClick={() => { onChoose(l.id); setOpen(false); }}
                  className={`flex items-center gap-3 rounded-2xl border px-4 text-start ${selected ? 'border-primary bg-primary/10' : 'border-border bg-card'}`} style={{ minHeight: 'calc(var(--lf-tap) + 12px)' }}>
                  <span className="lf-tile bg-primary/10 text-primary"><Sprout size={22} aria-hidden /></span>
                  <span className="min-w-0 flex-1"><span className="lf-lab block truncate">{l.name || t('home.unnamed_land')}</span><span className="lf-cap block truncate text-muted-foreground">{cropOf(l) ?? t('home.no_crop')}</span></span>
                  {selected && <Check size={20} aria-hidden className="shrink-0 text-primary" />}
                </button>
              );
            })}
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  );
}
