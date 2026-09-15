/**
 * ADVISOR CARD — the farmer-facing shape of every decision reply (2026-09-09).
 *
 * Order is the product contract and is fixed:
 *   1. respectful greeting        2. WHAT happened in the field
 *   3. WHY it happened            4. HOW to fix it (product / dose / method / safety / check)
 *   5. other notes (collapsed)    6. products available in the market (collapsed — the farmer taps to open)
 *
 * Rules followed here:
 * - Every colour comes from a theme token (bg-card, text-foreground, border-border, text-success…). No hex, no
 *   inline style, no per-section colour map — a white-label tenant changes the theme and this card follows.
 * - Mobile first: single column, 16px base text, 44px minimum tap targets, no horizontal scroll, safe truncation.
 * - All labels come from i18n (chatCards namespace) — no English string is hard-coded.
 * - The card renders only what the backend sent. An empty field is omitted, never filled with a placeholder.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, Sprout, HelpCircle, Wrench, Ban, Package, Info, Leaf, FileCheck } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface AdvisorProduct {
  name: string; brand?: string | null; company?: string | null;
  pack_sizes?: string | null; image_url?: string | null; product_id?: string | null;
}
export interface AdvisorCardData {
  version: number; language: string;
  kind: 'ADVICE' | 'DO_NOT' | 'INFO';
  greeting: string;
  crop?: string | null; stage?: string | null; das?: number | null;
  what_happened: string; why: string; how_to_fix: string;
  how_lines: string[];
  extras: Array<{ title: string; text: string }>;
  options?: Array<{ title: string; text: string }>;
  economics?: { yield_gain_pct?: number | null; cost_min?: number | null; cost_max?: number | null; cost_estimated?: number | null } | null;
  provenance?: {
    rule_id?: string | null; scientific_source?: string | null; scientific_basis?: string | null;
    university_source?: string | null; mode_of_action?: string | null; chemical_class?: string | null;
    resistance_group?: string | null; regulatory_status?: string | null; phi_source?: string | null;
    confidence_score?: number | null;
  } | null;
  products: AdvisorProduct[];
  source?: { rule_id?: string | null; explained_by?: string };
}

function Section({ icon: Icon, label, children, tone = 'default' }: {
  icon: typeof Sprout; label: string; children: React.ReactNode; tone?: 'default' | 'danger';
}) {
  return (
    <section className="px-4 py-3 border-t border-border first:border-t-0">
      <div className="flex items-center gap-2 mb-1.5">
        <Icon className={cn('h-4 w-4 shrink-0', tone === 'danger' ? 'text-destructive' : 'text-primary')} aria-hidden />
        <h3 className={cn('text-sm font-semibold tracking-wide', tone === 'danger' ? 'text-destructive' : 'text-foreground')}>{label}</h3>
      </div>
      <div className="text-base leading-relaxed text-foreground/90 break-words">{children}</div>
    </section>
  );
}

export function AdvisorCard({ data }: { data: AdvisorCardData }) {
  const { t } = useTranslation('chatCards');
  const [showExtras, setShowExtras] = useState(false);
  const [showProducts, setShowProducts] = useState(false);
  const [showSource, setShowSource] = useState(false);
  const prov = data.provenance ?? null;
  const provRows: Array<[string, string]> = prov ? ([
    ['sourceRule', prov.rule_id], ['sourceScience', prov.scientific_source || prov.scientific_basis],
    ['sourceUniversity', prov.university_source], ['sourceMoa', prov.mode_of_action],
    ['sourceResistance', prov.resistance_group], ['sourceRegulatory', prov.regulatory_status],
    ['sourcePhi', prov.phi_source],
  ].filter(([, v]) => !!v) as Array<[string, string]>) : [];
  const isBlock = data.kind === 'DO_NOT';

  return (
    <article className="rounded-2xl bg-card text-card-foreground border border-border overflow-hidden shadow-sm">
      {/* 1. greeting + context strip */}
      <header className="px-4 pt-4 pb-3">
        <p className="text-base font-medium text-foreground">{data.greeting}</p>
        {(data.crop || data.stage) && (
          <p className="mt-1 text-sm text-muted-foreground">
            {[data.crop, data.stage, typeof data.das === 'number' ? t('cards.dayN', { count: data.das, defaultValue: '' }) || `${data.das}` : null]
              .filter(Boolean).join(' · ')}
          </p>
        )}
      </header>

      {/* 2. WHAT happened */}
      {data.what_happened && (
        <Section icon={isBlock ? Ban : Sprout} label={t('cards.what', { defaultValue: 'What' })} tone={isBlock ? 'danger' : 'default'}>
          {data.what_happened}
        </Section>
      )}

      {/* 3. WHY */}
      {data.why && (
        <Section icon={HelpCircle} label={t('cards.why', { defaultValue: 'Why' })}>{data.why}</Section>
      )}

      {/* 4. HOW to fix */}
      {(data.how_to_fix || data.how_lines?.length > 0) && (
        <Section icon={Wrench} label={t('cards.how', { defaultValue: 'How' })}>
          {data.how_to_fix && <p>{data.how_to_fix}</p>}
          {data.how_lines?.length > 0 && (
            <ul className="mt-2 space-y-1.5">
              {data.how_lines.map((line, i) => (
                <li key={i} className="flex gap-2">
                  <span className="mt-2 h-1.5 w-1.5 rounded-full bg-primary shrink-0" aria-hidden />
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>
      )}

      {/* 4b. other ways to do it — DB alternatives / organic option */}
      {data.options && data.options.length > 0 && (
        <Section icon={Leaf} label={t('cards.otherOptions', { defaultValue: 'Other options' })}>
          <ul className="space-y-1.5">
            {data.options.map((o, i) => (
              <li key={i} className="flex gap-2">
                <span className="mt-2 h-1.5 w-1.5 rounded-full bg-muted-foreground/50 shrink-0" aria-hidden />
                <span>{o.title ? <span className="font-medium">{o.title}: </span> : null}{o.text}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* 5. other notes — collapsed */}
      {data.extras?.length > 0 && (
        <div className="border-t border-border">
          <button type="button" onClick={() => setShowExtras(v => !v)} aria-expanded={showExtras}
            className="w-full min-h-[44px] px-4 py-3 flex items-center justify-between gap-2 text-sm font-medium text-muted-foreground hover:text-foreground active:bg-muted/50 transition-colors">
            <span className="flex items-center gap-2"><Info className="h-4 w-4" aria-hidden />{t('cards.moreNotes', { defaultValue: 'Other notes' })} ({data.extras.length})</span>
            <ChevronDown className={cn('h-4 w-4 transition-transform', showExtras && 'rotate-180')} aria-hidden />
          </button>
          {showExtras && (
            <ul className="px-4 pb-3 space-y-3">
              {data.extras.map((e, i) => (
                <li key={i} className="text-sm">
                  {e.title && <p className="font-medium text-foreground">{e.title}</p>}
                  <p className="text-foreground/80 leading-relaxed">{e.text}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* 6. market products — collapsed, opened only on tap */}
      {data.products?.length > 0 && (
        <div className="border-t border-border">
          <button type="button" onClick={() => setShowProducts(v => !v)} aria-expanded={showProducts}
            className="w-full min-h-[44px] px-4 py-3 flex items-center justify-between gap-2 text-sm font-medium text-muted-foreground hover:text-foreground active:bg-muted/50 transition-colors">
            <span className="flex items-center gap-2"><Package className="h-4 w-4" aria-hidden />{t('cards.marketProducts', { defaultValue: 'Products available in the market' })} ({data.products.length})</span>
            <ChevronDown className={cn('h-4 w-4 transition-transform', showProducts && 'rotate-180')} aria-hidden />
          </button>
          {showProducts && (
            <ul className="px-4 pb-4 space-y-2">
              {data.products.map((p, i) => (
                <li key={p.product_id ?? i} className="flex items-center gap-3 rounded-xl border border-border bg-background/50 p-2.5">
                  {p.image_url ? (
                    <img src={p.image_url} alt="" loading="lazy" className="h-12 w-12 rounded-lg object-cover bg-muted shrink-0" />
                  ) : (
                    <span className="h-12 w-12 rounded-lg bg-muted flex items-center justify-center shrink-0" aria-hidden>
                      <Package className="h-5 w-5 text-muted-foreground" />
                    </span>
                  )}
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-foreground truncate">{p.name}</span>
                    {(p.company || p.pack_sizes) && (
                      <span className="block text-xs text-muted-foreground truncate">{[p.company, p.pack_sizes].filter(Boolean).join(' · ')}</span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="px-4 pb-3 text-xs text-muted-foreground">{t('cards.productsNote', { defaultValue: 'Shown for reference. Buy from a licensed dealer and read the label.' })}</p>
        </div>
      )}
      {/* 7. source and traceability — collapsed. Every claim above can be traced to this row. */}
      {provRows.length > 0 && (
        <div className="border-t border-border">
          <button type="button" onClick={() => setShowSource(v => !v)} aria-expanded={showSource}
            className="w-full min-h-[44px] px-4 py-3 flex items-center justify-between gap-2 text-sm font-medium text-muted-foreground hover:text-foreground active:bg-muted/50 transition-colors">
            <span className="flex items-center gap-2"><FileCheck className="h-4 w-4" aria-hidden />{t('cards.source', { defaultValue: 'Source of this advice' })}</span>
            <ChevronDown className={cn('h-4 w-4 transition-transform', showSource && 'rotate-180')} aria-hidden />
          </button>
          {showSource && (
            <dl className="px-4 pb-4 space-y-2 text-xs">
              {provRows.map(([key, value]) => (
                <div key={key} className="flex flex-col gap-0.5">
                  <dt className="text-muted-foreground">{t(`cards.${key}`, { defaultValue: key })}</dt>
                  <dd className="text-foreground/80 break-words">{value}</dd>
                </div>
              ))}
              {typeof prov?.confidence_score === 'number' && (
                <div className="flex flex-col gap-0.5">
                  <dt className="text-muted-foreground">{t('cards.confidence', { defaultValue: 'Confidence' })}</dt>
                  <dd className="text-foreground/80">{Math.round(prov.confidence_score * 100)}%</dd>
                </div>
              )}
            </dl>
          )}
        </div>
      )}
    </article>
  );
}
