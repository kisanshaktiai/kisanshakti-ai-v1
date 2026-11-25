import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Pause, Pencil, Play, Plus, Sprout, TreePine } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { EmptyState } from '@/components/layout/EmptyState';
import {
  BigNumber, ChoiceChips, Field, INPUT_CLASS, NativeSelect, Panel, PrimaryAction, ProviderPage, Question, SaveError, StatusBadge,
} from '@/components/provider/ProviderUi';
import { useProviderWorkspace } from '@/hooks/useProviderWorkspace';
import {
  localName, providerWorkspaceService,
  type LocalNames, type NamedOption, type NurseryBatch, type NurseryProduct,
} from '@/services/providerWorkspaceService';
import { PROVIDER_ROUTES } from '@/lib/providerRoutes';
import { catalogueLabel, formatDay, formatMoney, numberOrNull } from '@/lib/providerText';
import { cn } from '@/lib/utils';

interface ProductForm {
  id?: string;
  group: string;
  cropId: string;
  kind: string;
  unit: string;
  price: string;
  minOrder: string;
}
interface BatchForm {
  id?: string;
  productId: string;
  total: string;
  readyDate: string;
  reserved: number;
}

const EMPTY_PRODUCT: ProductForm = { group: '', cropId: '', kind: '', unit: '', price: '', minOrder: '' };
const pad = (n: number) => String(n).padStart(2, '0');
/** The device's own calendar day as "YYYY-MM-DD". */
const todayValue = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };

/**
 * Nursery store: the plants a nursery sells (crop, kind of plant, price) as
 * cards, each with its stock shown as a bar of what is free against what is
 * already promised to farmers. Stock already promised can never be reduced
 * below what is promised.
 */
export default function ProviderNursery() {
  const { t, i18n } = useTranslation();
  const {
    workspace, catalogue, loading, loadError, isOnline, saving, saveError, clearSaveError, run, reload,
  } = useProviderWorkspace();

  const [cropNames, setCropNames] = useState<Record<string, LocalNames>>({});
  const [groups, setGroups] = useState<NamedOption[]>([]);
  const [crops, setCrops] = useState<NamedOption[]>([]);
  const [product, setProduct] = useState<ProductForm | null>(null);
  const [batch, setBatch] = useState<BatchForm | null>(null);

  const products = workspace?.nursery_products ?? [];
  const cropIdsKey = products.map((p) => p.crop_id).sort().join(',');

  // Names of the crops already in the store.
  useEffect(() => {
    if (!cropIdsKey) return;
    let cancelled = false;
    providerWorkspaceService.cropNames(cropIdsKey.split(','))
      .then((names) => { if (!cancelled) setCropNames((current) => ({ ...current, ...names })); });
    return () => { cancelled = true; };
  }, [cropIdsKey]);

  // The crop groups, when the product form opens for a new product.
  const productOpen = !!product;
  useEffect(() => {
    if (!productOpen || groups.length > 0) return;
    let cancelled = false;
    providerWorkspaceService.cropGroups()
      .then((rows) => { if (!cancelled) setGroups(rows); })
      .catch(() => { /* the form shows an empty list; closing and opening tries again */ });
    return () => { cancelled = true; };
  }, [productOpen, groups.length]);

  const group = product?.group ?? '';
  useEffect(() => {
    setCrops([]);
    if (!group) return;
    let cancelled = false;
    providerWorkspaceService.cropsOfGroup(group)
      .then((rows) => { if (!cancelled) setCrops(rows); })
      .catch(() => { /* an empty list is shown */ });
    return () => { cancelled = true; };
  }, [group]);

  const cropName = (cropId: string) => localName(cropNames[cropId], i18n.language) || t('provider.nursery.cropUnknown');
  const kindLabel = (code: string) => catalogueLabel('nurseryKind', code, catalogue?.nurseryItemKinds.find((k) => k.code === code)?.label_en);
  const unitLabel = (code: string) => catalogueLabel('unit', code, catalogue?.pricingUnits.find((u) => u.code === code)?.label_en);
  const sellUnits = (catalogue?.pricingUnits ?? []).filter((u) => !u.is_per_area);
  const productUnit = sellUnits.find((u) => u.code === product?.unit);
  const price = numberOrNull(product?.price ?? '');
  const canSaveProduct = !!product?.cropId && !!product.kind && !!product.unit
    && (!!productUnit?.is_negotiable || (price != null && price >= 0)) && !saving && isOnline;

  const openNewProduct = () => { clearSaveError(); setProduct(EMPTY_PRODUCT); };
  const openEditProduct = (item: NurseryProduct) => {
    clearSaveError();
    setProduct({
      id: item.id, group: '', cropId: item.crop_id, kind: item.item_kind, unit: item.pricing_unit,
      price: item.price != null ? String(item.price) : '',
      minOrder: item.min_order_qty != null ? String(item.min_order_qty) : '',
    });
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!product || !canSaveProduct) return;
    const ok = await run(() => providerWorkspaceService.saveNurseryProduct({
      ...(product.id ? { id: product.id } : {}),
      crop_id: product.cropId,
      item_kind: product.kind,
      pricing_unit: product.unit,
      price: productUnit?.is_negotiable ? null : price,
      min_order_qty: numberOrNull(product.minOrder),
    }));
    if (ok) setProduct(null);
  };

  const total = numberOrNull(batch?.total ?? '');
  const canSaveBatch = !!batch && total != null && Number.isInteger(total) && total >= batch.reserved
    && !!batch.readyDate && !saving && isOnline;

  const openNewBatch = (productId: string) => {
    clearSaveError();
    setBatch({ productId, total: '', readyDate: todayValue(), reserved: 0 });
  };
  const openEditBatch = (productId: string, item: NurseryBatch) => {
    clearSaveError();
    setBatch({ id: item.id, productId, total: String(item.total_qty), readyDate: item.ready_date, reserved: item.reserved_qty });
  };

  const handleSaveBatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!batch || !canSaveBatch || total == null) return;
    const ok = await run(() => providerWorkspaceService.saveNurseryBatch({
      ...(batch.id ? { id: batch.id } : { product_id: batch.productId }),
      total_qty: total,
      ready_date: batch.readyDate,
    }));
    if (ok) setBatch(null);
  };

  const togglePause = (item: NurseryProduct) =>
    run(() => providerWorkspaceService.saveNurseryProduct({
      id: item.id, crop_id: item.crop_id, item_kind: item.item_kind, pricing_unit: item.pricing_unit,
      price: item.price, min_order_qty: item.min_order_qty,
      status: item.status === 'PAUSED' ? 'ACTIVE' : 'PAUSED',
    }));

  const sheetOpen = !!product || !!batch;
  const totals = products.reduce(
    (acc, p) => {
      for (const b of p.batches) { acc.stock += b.total_qty; acc.reserved += b.reserved_qty; }
      return acc;
    },
    { stock: 0, reserved: 0 },
  );

  return (
    <ProviderPage
      title={t('provider.nursery.title')}
      backTo={PROVIDER_ROUTES.business}
      pending={(loading && !workspace) || !catalogue}
      loadError={loadError}
      onRetry={reload}
      isOnline={isOnline}
      footer={workspace && catalogue ? <PrimaryAction onClick={openNewProduct} disabled={!isOnline} icon={Plus}>{t('provider.nursery.add')}</PrimaryAction> : undefined}
    >
      {workspace && catalogue && (
        <div className="space-y-4">
          {!sheetOpen && <SaveError message={saveError} />}

          <div className="grid grid-cols-3 rounded-3xl bg-primary p-4 text-center text-primary-foreground shadow-md">
            <div>
              <p className="text-3xl font-bold leading-tight">{products.length}</p>
              <p className="text-xs font-medium opacity-90">{t('provider.nursery.summaryPlants')}</p>
            </div>
            <div className="border-x border-primary-foreground/30">
              <p className="text-3xl font-bold leading-tight">{totals.stock}</p>
              <p className="text-xs font-medium opacity-90">{t('provider.nursery.summaryStock')}</p>
            </div>
            <div>
              <p className="text-3xl font-bold leading-tight">{totals.reserved}</p>
              <p className="text-xs font-medium opacity-90">{t('provider.nursery.summaryReserved')}</p>
            </div>
          </div>

          {products.length === 0 && (
            <EmptyState
              icon={Sprout}
              title={t('provider.nursery.emptyTitle')}
              description={t('provider.nursery.emptyDescription')}
            />
          )}

          {products.map((item) => {
            const paused = item.status === 'PAUSED';
            const stock = item.batches.reduce((n, b) => n + b.total_qty, 0);
            const reserved = item.batches.reduce((n, b) => n + b.reserved_qty, 0);
            const reservedShare = stock > 0 ? Math.min(100, Math.round((reserved / stock) * 100)) : 0;
            return (
              <Panel key={item.id} className={cn('space-y-3', paused && 'opacity-80')}>
                <div className="flex gap-3">
                  <span className="flex h-24 w-24 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                    <TreePine className="h-10 w-10" strokeWidth={1.5} aria-hidden="true" />
                  </span>
                  <div className="flex-1 min-w-0 space-y-1">
                    <p className="text-xl font-bold leading-tight text-foreground break-words">{cropName(item.crop_id)}</p>
                    <p className="text-sm text-muted-foreground break-words">{kindLabel(item.item_kind)}</p>
                    <p className="text-xl font-bold text-primary">
                      {item.price != null
                        ? t('provider.services.rateWithUnit', { rate: formatMoney(Number(item.price), item.currency), unit: unitLabel(item.pricing_unit) })
                        : unitLabel(item.pricing_unit)}
                    </p>
                    <StatusBadge tone={paused ? 'off' : 'good'}>{t(`provider.common.status.${item.status}`)}</StatusBadge>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex justify-between text-sm font-semibold">
                    <span className="text-foreground">{t('provider.nursery.inStock', { count: stock })}</span>
                    {reserved > 0 && <span className="text-warning-foreground">{t('provider.nursery.batchReserved', { count: reserved })}</span>}
                  </div>
                  <div className="h-3 overflow-hidden rounded-full bg-primary/15" aria-hidden="true">
                    <div className="h-full bg-warning" style={{ width: `${reservedShare}%` }} />
                  </div>
                </div>

                {item.batches.length === 0 && (
                  <p className="text-base text-muted-foreground">{t('provider.nursery.stockEmpty')}</p>
                )}
                {item.batches.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => openEditBatch(item.id, b)}
                    disabled={!isOnline}
                    className="flex w-full min-h-[56px] items-center justify-between gap-3 rounded-2xl bg-muted px-4 py-2 text-left disabled:opacity-60"
                  >
                    <span className="min-w-0">
                      <span className="block text-base font-bold text-foreground">{t('provider.nursery.batchQty', { count: b.total_qty })}</span>
                      <span className="block text-sm text-muted-foreground">
                        {t('provider.nursery.batchReady', { date: formatDay(b.ready_date) })}
                        {b.reserved_qty > 0 ? ` · ${t('provider.nursery.batchReserved', { count: b.reserved_qty })}` : ''}
                      </span>
                    </span>
                    <Pencil className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                  </button>
                ))}

                <div className="grid grid-cols-3 gap-2">
                  <Button className="h-12 rounded-2xl" onClick={() => openNewBatch(item.id)} disabled={!isOnline}>
                    <Plus className="w-4 h-4 mr-1.5" aria-hidden="true" />
                    <span className="truncate">{t('provider.nursery.addStock')}</span>
                  </Button>
                  <Button variant="outline" className="h-12 rounded-2xl" onClick={() => openEditProduct(item)} disabled={!isOnline}>
                    <Pencil className="w-4 h-4 mr-1.5" aria-hidden="true" />
                    <span className="truncate">{t('provider.common.edit')}</span>
                  </Button>
                  <Button variant="outline" className="h-12 rounded-2xl" onClick={() => togglePause(item)} disabled={saving || !isOnline}>
                    {paused ? <Play className="w-4 h-4 mr-1.5" aria-hidden="true" /> : <Pause className="w-4 h-4 mr-1.5" aria-hidden="true" />}
                    <span className="truncate">{t(paused ? 'provider.services.resume' : 'provider.services.pause')}</span>
                  </Button>
                </div>
              </Panel>
            );
          })}

          <Sheet open={!!product} onOpenChange={(open) => { if (!open) setProduct(null); }}>
            <SheetContent side="bottom" className="rounded-t-3xl pb-safe max-h-[92vh] overflow-y-auto">
              <SheetHeader className="text-left mb-4">
                <SheetTitle className="text-xl">{t(product?.id ? 'provider.nursery.editTitle' : 'provider.nursery.add')}</SheetTitle>
              </SheetHeader>
              {product && (
                <form onSubmit={handleSaveProduct} className="space-y-5">
                  <SaveError message={saveError} />

                  {product.id ? (
                    <Field label={t('provider.nursery.cropLabel')}>
                      <p className="text-xl font-bold text-foreground">{cropName(product.cropId)}</p>
                    </Field>
                  ) : (
                    <>
                      <Question>{t('provider.nursery.cropQuestion')}</Question>
                      <Field label={t('provider.nursery.groupLabel')} htmlFor="nursery-group">
                        <NativeSelect
                          id="nursery-group"
                          value={product.group}
                          onChange={(value) => setProduct({ ...product, group: value, cropId: '' })}
                          options={groups.map((g) => ({ value: g.id, label: localName(g.names, i18n.language) }))}
                          placeholder={t('provider.common.choose')}
                          disabled={saving}
                        />
                      </Field>
                      {product.group && (
                        <Field label={t('provider.nursery.cropLabel')} htmlFor="nursery-crop">
                          <NativeSelect
                            id="nursery-crop"
                            value={product.cropId}
                            onChange={(value) => {
                              const chosen = crops.find((c) => c.id === value);
                              if (chosen) setCropNames((current) => ({ ...current, [chosen.id]: chosen.names }));
                              setProduct({ ...product, cropId: value });
                            }}
                            options={crops.map((c) => ({ value: c.id, label: localName(c.names, i18n.language) }))}
                            placeholder={t('provider.common.choose')}
                            disabled={saving}
                          />
                        </Field>
                      )}
                    </>
                  )}

                  {product.cropId && (
                    <>
                      <Field label={t('provider.nursery.kindLabel')}>
                        <ChoiceChips
                          label={t('provider.nursery.kindLabel')}
                          options={catalogue.nurseryItemKinds.map((k) => ({ value: k.code, label: kindLabel(k.code) }))}
                          selected={product.kind ? [product.kind] : []}
                          onToggle={(value) => setProduct({ ...product, kind: value })}
                          disabled={saving}
                        />
                      </Field>
                      <Field label={t('provider.services.unitLabel')}>
                        <ChoiceChips
                          label={t('provider.services.unitLabel')}
                          options={sellUnits.map((u) => ({ value: u.code, label: unitLabel(u.code) }))}
                          selected={product.unit ? [product.unit] : []}
                          onToggle={(value) => setProduct({ ...product, unit: value })}
                          disabled={saving}
                        />
                      </Field>
                      {product.unit && !productUnit?.is_negotiable && (
                        <BigNumber
                          id="nursery-price"
                          label={t('provider.nursery.priceLabel')}
                          value={product.price}
                          onChange={(v) => setProduct({ ...product, price: v })}
                          step={1}
                          caption={unitLabel(product.unit)}
                          disabled={saving}
                        />
                      )}
                      <Field label={t('provider.nursery.minOrderLabel')} htmlFor="nursery-min-order">
                        <Input id="nursery-min-order" type="number" inputMode="numeric" min={1} step="1" value={product.minOrder} onChange={(e) => setProduct({ ...product, minOrder: e.target.value })} className={INPUT_CLASS} disabled={saving} />
                      </Field>
                    </>
                  )}

                  <Button type="submit" disabled={!canSaveProduct} className="w-full h-14 rounded-2xl text-lg font-semibold">
                    {saving && <Loader2 className="w-5 h-5 animate-spin mr-2" aria-hidden="true" />}
                    {t('provider.common.save')}
                  </Button>
                </form>
              )}
            </SheetContent>
          </Sheet>

          <Sheet open={!!batch} onOpenChange={(open) => { if (!open) setBatch(null); }}>
            <SheetContent side="bottom" className="rounded-t-3xl pb-safe max-h-[92vh] overflow-y-auto">
              <SheetHeader className="text-left mb-4">
                <SheetTitle className="text-xl">{t(batch?.id ? 'provider.nursery.editStock' : 'provider.nursery.addStock')}</SheetTitle>
              </SheetHeader>
              {batch && (
                <form onSubmit={handleSaveBatch} className="space-y-5">
                  <SaveError message={saveError} />
                  <BigNumber
                    id="nursery-total"
                    label={t('provider.nursery.totalLabel')}
                    value={batch.total}
                    onChange={(v) => setBatch({ ...batch, total: v })}
                    step={50}
                    min={batch.reserved}
                    caption={batch.reserved > 0 ? t('provider.nursery.totalHint', { count: batch.reserved }) : undefined}
                    disabled={saving}
                  />
                  <Field label={t('provider.nursery.readyLabel')} htmlFor="nursery-ready">
                    <Input id="nursery-ready" type="date" value={batch.readyDate} onChange={(e) => setBatch({ ...batch, readyDate: e.target.value })} className={INPUT_CLASS} disabled={saving} required />
                  </Field>
                  <Button type="submit" disabled={!canSaveBatch} className="w-full h-14 rounded-2xl text-lg font-semibold">
                    {saving && <Loader2 className="w-5 h-5 animate-spin mr-2" aria-hidden="true" />}
                    {t('provider.common.save')}
                  </Button>
                </form>
              )}
            </SheetContent>
          </Sheet>
        </div>
      )}
    </ProviderPage>
  );
}
