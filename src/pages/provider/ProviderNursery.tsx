import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Pause, Pencil, Play, Plus, Sprout } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { EmptyState } from '@/components/layout/EmptyState';
import { Field, INPUT_CLASS, NativeSelect, ProviderPage, SaveError } from '@/components/provider/ProviderUi';
import { useProviderWorkspace } from '@/hooks/useProviderWorkspace';
import {
  localName, providerWorkspaceService,
  type LocalNames, type NamedOption, type NurseryBatch, type NurseryProduct,
} from '@/services/providerWorkspaceService';
import { PROVIDER_ROUTES } from '@/lib/providerRoutes';
import { catalogueLabel, formatDay, formatMoney, numberOrNull } from '@/lib/providerText';

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

/**
 * Nursery store: the plants a nursery sells (crop, kind of plant, price) and,
 * for each, the stock by the date it will be ready. Stock already promised to
 * farmers is shown and can never be reduced below what is promised.
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
    setBatch({ productId, total: '', readyDate: '', reserved: 0 });
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

  return (
    <ProviderPage
      title={t('provider.nursery.title')}
      backTo={PROVIDER_ROUTES.business}
      pending={(loading && !workspace) || !catalogue}
      loadError={loadError}
      onRetry={reload}
      isOnline={isOnline}
    >
      {workspace && catalogue && (
        <>
          <p className="text-sm text-muted-foreground">{t('provider.nursery.description')}</p>
          {!sheetOpen && <SaveError message={saveError} />}

          <Button className="w-full h-12 text-base" onClick={openNewProduct} disabled={!isOnline}>
            <Plus className="w-5 h-5 mr-2" aria-hidden="true" />
            {t('provider.nursery.add')}
          </Button>

          {products.length === 0 && (
            <EmptyState
              icon={Sprout}
              title={t('provider.nursery.emptyTitle')}
              description={t('provider.nursery.emptyDescription')}
            />
          )}

          {products.map((item) => {
            const unit = catalogue.pricingUnits.find((u) => u.code === item.pricing_unit);
            const unitLabel = catalogueLabel('unit', item.pricing_unit, unit?.label_en);
            const paused = item.status === 'PAUSED';
            return (
              <Card key={item.id} className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-base font-semibold text-foreground break-words">{cropName(item.crop_id)}</p>
                    <p className="text-sm text-muted-foreground break-words">
                      {catalogueLabel('nurseryKind', item.item_kind, catalogue.nurseryItemKinds.find((k) => k.code === item.item_kind)?.label_en)}
                    </p>
                  </div>
                  <Badge variant={paused ? 'secondary' : 'default'} className="shrink-0">
                    {t(`provider.common.status.${item.status}`)}
                  </Badge>
                </div>
                <p className="text-lg font-semibold text-foreground">
                  {item.price != null
                    ? t('provider.services.rateWithUnit', { rate: formatMoney(Number(item.price), item.currency), unit: unitLabel })
                    : unitLabel}
                </p>

                <div className="space-y-2">
                  <p className="text-sm font-semibold text-foreground">{t('provider.nursery.stockTitle')}</p>
                  {item.batches.length === 0 && (
                    <p className="text-sm text-muted-foreground">{t('provider.nursery.stockEmpty')}</p>
                  )}
                  {item.batches.map((b) => (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => openEditBatch(item.id, b)}
                      disabled={!isOnline}
                      className="w-full min-h-[56px] flex items-center justify-between gap-3 rounded-2xl border border-border bg-card px-3 py-2 text-left disabled:opacity-60"
                    >
                      <span className="min-w-0">
                        <span className="block text-base font-semibold text-foreground">
                          {t('provider.nursery.batchQty', { count: b.total_qty })}
                        </span>
                        <span className="block text-sm text-muted-foreground">
                          {t('provider.nursery.batchReady', { date: formatDay(b.ready_date) })}
                          {b.reserved_qty > 0 ? ` · ${t('provider.nursery.batchReserved', { count: b.reserved_qty })}` : ''}
                        </span>
                      </span>
                      <Pencil className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    </button>
                  ))}
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <Button variant="outline" className="h-12" onClick={() => openNewBatch(item.id)} disabled={!isOnline}>
                    <Plus className="w-4 h-4 mr-1.5" aria-hidden="true" />
                    <span className="truncate">{t('provider.nursery.addStock')}</span>
                  </Button>
                  <Button variant="outline" className="h-12" onClick={() => openEditProduct(item)} disabled={!isOnline}>
                    <Pencil className="w-4 h-4 mr-1.5" aria-hidden="true" />
                    <span className="truncate">{t('provider.common.edit')}</span>
                  </Button>
                  <Button variant="outline" className="h-12" onClick={() => togglePause(item)} disabled={saving || !isOnline}>
                    {paused ? <Play className="w-4 h-4 mr-1.5" aria-hidden="true" /> : <Pause className="w-4 h-4 mr-1.5" aria-hidden="true" />}
                    <span className="truncate">{t(paused ? 'provider.services.resume' : 'provider.services.pause')}</span>
                  </Button>
                </div>
              </Card>
            );
          })}

          <Sheet open={!!product} onOpenChange={(open) => { if (!open) setProduct(null); }}>
            <SheetContent side="bottom" className="rounded-t-3xl pb-safe max-h-[92vh] overflow-y-auto">
              <SheetHeader className="text-left mb-4">
                <SheetTitle>{t(product?.id ? 'provider.nursery.editTitle' : 'provider.nursery.add')}</SheetTitle>
              </SheetHeader>
              {product && (
                <form onSubmit={handleSaveProduct} className="space-y-5">
                  <SaveError message={saveError} />

                  {product.id ? (
                    <Field label={t('provider.nursery.cropLabel')}>
                      <p className="text-lg font-semibold text-foreground">{cropName(product.cropId)}</p>
                    </Field>
                  ) : (
                    <>
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

                  <Field label={t('provider.nursery.kindLabel')} htmlFor="nursery-kind">
                    <NativeSelect
                      id="nursery-kind"
                      value={product.kind}
                      onChange={(value) => setProduct({ ...product, kind: value })}
                      options={catalogue.nurseryItemKinds.map((k) => ({ value: k.code, label: catalogueLabel('nurseryKind', k.code, k.label_en) }))}
                      placeholder={t('provider.common.choose')}
                      disabled={saving}
                    />
                  </Field>
                  <Field label={t('provider.services.unitLabel')} htmlFor="nursery-unit">
                    <NativeSelect
                      id="nursery-unit"
                      value={product.unit}
                      onChange={(value) => setProduct({ ...product, unit: value })}
                      options={sellUnits.map((u) => ({ value: u.code, label: catalogueLabel('unit', u.code, u.label_en) }))}
                      placeholder={t('provider.common.choose')}
                      disabled={saving}
                    />
                  </Field>
                  {!productUnit?.is_negotiable && (
                    <Field label={t('provider.nursery.priceLabel')} htmlFor="nursery-price">
                      <Input id="nursery-price" type="number" inputMode="decimal" min={0} step="0.01" value={product.price} onChange={(e) => setProduct({ ...product, price: e.target.value })} className={INPUT_CLASS} disabled={saving} />
                    </Field>
                  )}
                  <Field label={t('provider.nursery.minOrderLabel')} htmlFor="nursery-min-order">
                    <Input id="nursery-min-order" type="number" inputMode="numeric" min={1} step="1" value={product.minOrder} onChange={(e) => setProduct({ ...product, minOrder: e.target.value })} className={INPUT_CLASS} disabled={saving} />
                  </Field>

                  <Button type="submit" disabled={!canSaveProduct} className="w-full h-12 text-base">
                    {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" aria-hidden="true" />}
                    {t('provider.common.save')}
                  </Button>
                </form>
              )}
            </SheetContent>
          </Sheet>

          <Sheet open={!!batch} onOpenChange={(open) => { if (!open) setBatch(null); }}>
            <SheetContent side="bottom" className="rounded-t-3xl pb-safe max-h-[92vh] overflow-y-auto">
              <SheetHeader className="text-left mb-4">
                <SheetTitle>{t(batch?.id ? 'provider.nursery.editStock' : 'provider.nursery.addStock')}</SheetTitle>
              </SheetHeader>
              {batch && (
                <form onSubmit={handleSaveBatch} className="space-y-5">
                  <SaveError message={saveError} />
                  <Field
                    label={t('provider.nursery.totalLabel')}
                    htmlFor="nursery-total"
                    hint={batch.reserved > 0 ? t('provider.nursery.totalHint', { count: batch.reserved }) : undefined}
                  >
                    <Input id="nursery-total" type="number" inputMode="numeric" min={batch.reserved} step="1" value={batch.total} onChange={(e) => setBatch({ ...batch, total: e.target.value })} className={INPUT_CLASS} disabled={saving} required />
                  </Field>
                  <Field label={t('provider.nursery.readyLabel')} htmlFor="nursery-ready">
                    <Input id="nursery-ready" type="date" value={batch.readyDate} onChange={(e) => setBatch({ ...batch, readyDate: e.target.value })} className={INPUT_CLASS} disabled={saving} required />
                  </Field>
                  <Button type="submit" disabled={!canSaveBatch} className="w-full h-12 text-base">
                    {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" aria-hidden="true" />}
                    {t('provider.common.save')}
                  </Button>
                </form>
              )}
            </SheetContent>
          </Sheet>
        </>
      )}
    </ProviderPage>
  );
}
