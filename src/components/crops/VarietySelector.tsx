import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, Search, Sparkles, X, Sprout } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface VarietyOption {
  id: string;
  name: string;
  variety_code: string | null;
  brand: string | null;
  season: string | null;
  maturity_days_min: number | null;
  maturity_days_max: number | null;
  yield_potential_qtl_per_acre: number | null;
  released_by: string | null;
  is_featured: boolean | null;
  label_hi: string | null;
  label_mr: string | null;
  parentage: string | null;
}

interface VarietySelectorProps {
  /** The crop id (public.crops.id) to filter varieties by. Required. */
  cropId: string | null | undefined;
  /** Currently selected variety id, if any. */
  value?: string | null;
  /** Called when the user picks (or clears) a variety. */
  onChange: (variety: VarietyOption | null) => void;
  /** Optional label override. */
  label?: string;
  /** Compact (smaller) layout for embedding in narrow dialogs. */
  compact?: boolean;
}

/**
 * VarietySelector — Phase 3 farmer-facing dropdown that lists every seed variety
 * stored as a master_product (product_type='seed') for the given crop.
 *
 * Honours the project invariant: 100% of agronomic data comes from the DB.
 * No hard-coded variety lists.
 */
export function VarietySelector({
  cropId,
  value,
  onChange,
  label = 'Seed variety (optional)',
  compact = false,
}: VarietySelectorProps) {
  const [varieties, setVarieties] = useState<VarietyOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!cropId) {
      setVarieties([]);
      return;
    }
    setLoading(true);
    (async () => {
      const { data, error } = await supabase
        .from('master_products')
        .select(
          'id,name,variety_code,brand,season,maturity_days_min,maturity_days_max,yield_potential_qtl_per_acre,released_by,is_featured,label_hi,label_mr,parentage'
        )
        .eq('product_type', 'seed')
        .eq('status', 'active')
        .eq('crop_id', cropId)
        .order('is_featured', { ascending: false })
        .order('name', { ascending: true });

      if (cancelled) return;
      if (error) {
        console.error('[VarietySelector] load error', error);
        setVarieties([]);
      } else {
        setVarieties((data ?? []) as VarietyOption[]);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [cropId]);

  const selected = useMemo(
    () => varieties.find((v) => v.id === value) ?? null,
    [varieties, value]
  );

  const filtered = useMemo(() => {
    if (!search.trim()) return varieties;
    const q = search.toLowerCase();
    return varieties.filter((v) =>
      [v.name, v.variety_code, v.brand, v.label_hi, v.label_mr, v.released_by]
        .filter(Boolean)
        .some((s) => String(s).toLowerCase().includes(q))
    );
  }, [varieties, search]);

  if (!cropId) {
    return (
      <div className="text-xs text-muted-foreground italic">
        Select a crop first to see its varieties.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium flex items-center gap-1.5">
          <Sprout className="h-3.5 w-3.5 text-primary" />
          {label}
        </label>
        {selected && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs"
            onClick={() => {
              onChange(null);
              setOpen(false);
            }}
          >
            <X className="h-3 w-3 mr-1" /> Clear
          </Button>
        )}
      </div>

      {/* Selected card */}
      {selected ? (
        <Card className="border-primary/40 bg-primary/5">
          <CardContent className={cn('p-3', compact && 'p-2')}>
            <div className="flex items-start justify-between gap-2">
              <div className="space-y-1 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm">{selected.name}</span>
                  {selected.is_featured && (
                    <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                      <Sparkles className="h-3 w-3 mr-0.5" /> Popular
                    </Badge>
                  )}
                </div>
                {selected.brand && (
                  <p className="text-xs text-muted-foreground">{selected.brand}</p>
                )}
                <div className="flex flex-wrap gap-1.5 pt-0.5">
                  {selected.maturity_days_min && selected.maturity_days_max && (
                    <Badge variant="outline" className="text-[10px] h-5">
                      {selected.maturity_days_min}–{selected.maturity_days_max} days
                    </Badge>
                  )}
                  {selected.yield_potential_qtl_per_acre != null && (
                    <Badge variant="outline" className="text-[10px] h-5">
                      ~{selected.yield_potential_qtl_per_acre} q/acre
                    </Badge>
                  )}
                  {selected.season && (
                    <Badge variant="outline" className="text-[10px] h-5 capitalize">
                      {selected.season}
                    </Badge>
                  )}
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() => setOpen((o) => !o)}
              >
                Change
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Button
          type="button"
          variant="outline"
          className="w-full justify-start text-sm font-normal"
          onClick={() => setOpen((o) => !o)}
        >
          <Search className="h-4 w-4 mr-2 text-muted-foreground" />
          {loading ? 'Loading varieties…' : `Choose from ${varieties.length} varieties`}
        </Button>
      )}

      {/* Picker */}
      {open && (
        <Card>
          <CardContent className="p-2 space-y-2">
            <Input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, code, brand…"
              className="h-8 text-sm"
            />
            {loading ? (
              <div className="flex items-center justify-center py-6 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            ) : filtered.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">
                No varieties match your search.
              </p>
            ) : (
              <ScrollArea className="h-64">
                <div className="space-y-1.5 pr-2">
                  {filtered.map((v) => (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => {
                        onChange(v);
                        setOpen(false);
                        setSearch('');
                      }}
                      className={cn(
                        'w-full text-left rounded-md border p-2.5 transition-colors',
                        'hover:border-primary hover:bg-primary/5',
                        value === v.id && 'border-primary bg-primary/10'
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="space-y-0.5 flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-medium text-sm">{v.name}</span>
                            {v.is_featured && (
                              <Sparkles className="h-3 w-3 text-primary" />
                            )}
                          </div>
                          {v.brand && (
                            <p className="text-[11px] text-muted-foreground truncate">
                              {v.brand}
                            </p>
                          )}
                          <div className="flex flex-wrap gap-1 pt-0.5">
                            {v.maturity_days_min && v.maturity_days_max && (
                              <Badge variant="outline" className="text-[10px] h-4 px-1">
                                {v.maturity_days_min}–{v.maturity_days_max}d
                              </Badge>
                            )}
                            {v.yield_potential_qtl_per_acre != null && (
                              <Badge variant="outline" className="text-[10px] h-4 px-1">
                                ~{v.yield_potential_qtl_per_acre} q/ac
                              </Badge>
                            )}
                            {v.season && (
                              <Badge variant="outline" className="text-[10px] h-4 px-1 capitalize">
                                {v.season}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default VarietySelector;
