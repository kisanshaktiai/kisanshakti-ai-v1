import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, RefreshCw, ScanLine, Sprout, Database, MapPin, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { soilNumber, type SoilState } from '@/services/soil/soilReport';

export function SoilFetchPanel({state,requesting,error,onFetch}:{state:SoilState;requesting:boolean;error:string|null;onFetch:()=>void}) {
  const {t,i18n}=useTranslation();
  const [depth,setDepth]=useState('0-5cm');
  const {model,job}=state;
  const active=job?.status==='queued'||job?.status==='running';
  const stale=state.boundary_changed||state.source_changed||!!model&&Date.parse(model.expires_at)<Date.now();
  const points=model?.sampling.points || [];
  const xs=points.map(p=>p.x_m),ys=points.map(p=>p.y_m);
  const x0=Math.min(...xs),y0=Math.min(...ys),dx=Math.max(...xs)-x0||1,dy=Math.max(...ys)-y0||1;
  const plot=points.map(p=>({x:20+260*(p.x_m-x0)/dx,y:145-125*(p.y_m-y0)/dy,order:p.order}));
  const format=(value:unknown,digits=1)=> {const n=soilNumber(value);return n===null?'—':n.toLocaleString(i18n.language,{maximumFractionDigits:digits});};
  const metrics=[['phh2o','ph','pH'],['soc','organicCarbon','%'],['nitrogen','totalNitrogen','g/kg'],['cec','cec','cmol(+)/kg'],['sand','sand','%'],['silt','silt','%'],['clay','clay','%'],['bdod','bulkDensity','g/cm³']];
  return <section className="overflow-hidden rounded-3xl border border-border bg-card shadow-sm" aria-label={t('soil.report')}>
    <div className="relative overflow-hidden border-b bg-gradient-to-br from-primary/15 via-background to-primary/5 p-5 sm:p-7">
      <div className="flex items-start justify-between gap-3">
        <div><p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-primary"><Sprout className="h-4 w-4"/>{t('soil.landIntelligence')}</p>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">{state.land.name}</h1>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground">{t('soil.fetchIntro')}</p></div>
        <span className="rounded-full border bg-background/80 px-3 py-1 text-xs font-medium">{t(active?'soil.processing':model?'soil.saved':'soil.ready')}</span>
      </div>
      <div className="mt-5 flex flex-wrap gap-2 text-xs text-muted-foreground">
        <span className="rounded-full bg-background px-3 py-1.5">{t('soil.zigzagRange')}</span>
        <span className="rounded-full bg-background px-3 py-1.5">{t('soil.threeDepths')}</span>
        <span className="rounded-full bg-background px-3 py-1.5">{t('soil.savedForReuse')}</span>
      </div>
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Button className="min-h-12 rounded-xl px-6" onClick={onFetch} disabled={requesting||active||!state.engine_available}>
          {requesting||active?<Loader2 className="mr-2 h-4 w-4 animate-spin"/>:model?<RefreshCw className="mr-2 h-4 w-4"/>:<ScanLine className="mr-2 h-4 w-4"/>}
          {t(active?'soil.processing':requesting?'soil.starting':model?'soil.checkSoil':'soil.getSoil')}
        </Button>
        {!state.engine_available&&!active&&<p role="status" className="text-sm text-muted-foreground">{t(state.engine_status==='SOURCE_NOT_CONFIGURED'?'soil.sourceNotConfigured':state.engine_status==='QUEUE_UNAVAILABLE'?'soil.queueUnavailable':'soil.engineOffline')}</p>}
        {state.engine_available&&state.dispatch_mode==='scheduled'&&!active&&<p role="status" className="text-sm text-muted-foreground">{t('soil.scheduledDispatch')}</p>}
        {model&&!stale&&!active&&<span className="flex items-center gap-1.5 text-xs text-muted-foreground"><CheckCircle2 className="h-4 w-4"/>{t('soil.cachedHelp')}</span>}
      </div>
      {(error||job?.status==='failed')&&<p role="alert" className="mt-3 rounded-xl border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">
        {t(error==='INVALID_BOUNDARY'?'soil.invalidBoundary':error==='RETRY_LATER'?'soil.retryLater':error==='ENGINE_NOT_CONFIGURED'?'soil.sourceNotConfigured':error==='ENGINE_OFFLINE'?'soil.engineOffline':'soil.fetchFailed')}
      </p>}
      {stale&&<p className="mt-3 text-sm text-muted-foreground">{t('soil.refreshNeeded')}</p>}
    </div>
    {active&&<div role="status" aria-live="polite" className="space-y-3 border-b p-5">
      <div className="flex justify-between text-sm"><span>{t(job?.status==='queued'?'soil.queued':'soil.fetchingLayers')}</span><span>{job?.progress||0}%</span></div>
      <Progress value={job?.progress||0}/><p className="text-xs text-muted-foreground">{t('soil.canLeave')}</p>
      {job?.status==='queued'&&state.dispatch_mode==='scheduled'&&<p className="text-xs text-muted-foreground">{t('soil.scheduledQueueHelp')}</p>}
    </div>}
    {!model&&<div className="grid gap-4 p-5 sm:grid-cols-3">
      {[[MapPin,'soil.stepBoundary'],[ScanLine,'soil.stepFetch'],[Database,'soil.stepSave']].map(([Icon,label],i)=>{const Symbol=Icon as typeof MapPin;return <div key={String(label)} className="flex gap-3 rounded-2xl bg-muted/40 p-4"><Symbol className="mt-0.5 h-5 w-5 shrink-0 text-primary"/><div><span className="text-xs text-muted-foreground">0{i+1}</span><p className="mt-1 text-sm font-medium">{t(String(label))}</p></div></div>;})}
    </div>}
    {model&&<div className="space-y-5 p-5 sm:p-7">
      {model.quality==='partial'&&<p role="status" className="rounded-xl border p-3 text-sm">{t('soil.partialHelp')}</p>}
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-semibold">{t('soil.depthProfile')}</h2>
        <div className="flex gap-1 rounded-xl bg-muted p-1" role="group" aria-label={t('soil.depthProfile')}>
          {['0-5cm','5-15cm','15-30cm'].map(d=><button key={d} onClick={()=>setDepth(d)} aria-pressed={depth===d} className={`rounded-lg px-3 py-2 text-xs font-medium ${depth===d?'bg-background shadow-sm':'text-muted-foreground'}`}>{d.replace('cm',' cm')}</button>)}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{metrics.map(([key,label,unit])=>{const layer=model.properties[key]?.[depth];return <div key={key} className="rounded-2xl border bg-background p-4">
        <p className="text-xs text-muted-foreground">{t('soil.'+label)}</p><p className="mt-2 text-2xl font-semibold tabular-nums">{format(layer?.mean,2)}</p><p className="mt-1 text-xs text-muted-foreground">{unit}</p>
        {layer?.quality!=='complete'&&<p className="mt-2 text-xs text-muted-foreground">{t('soil.limitedCoverage')}</p>}
      </div>;})}</div>
      <div className="grid gap-4 rounded-2xl bg-muted/40 p-4 sm:grid-cols-2"><div>
        <h3 className="font-medium">{t('soil.samplingCoverage')}</h3>
        <p className="mt-2 text-sm">{format(model.sampling.generated_points,0)} {t('soil.positions')} · {format(model.area_m2/10000,2)} ha</p>
        <p className="mt-2 text-xs text-muted-foreground">{t('soil.pixelHelp')}</p><p className="mt-2 text-xs text-muted-foreground">{t('soil.sketchHelp')}</p>
      </div><svg viewBox="0 0 300 165" className="w-full rounded-xl border bg-background" role="img" aria-label={t('soil.samplingCoverage')}>
        <polyline points={plot.map(p=>`${p.x},${p.y}`).join(' ')} fill="none" stroke="currentColor" className="text-primary/40" strokeWidth="2" strokeDasharray="5 4"/>
        {plot.map(p=><g key={p.order}><circle cx={p.x} cy={p.y} r="9" fill="currentColor" className="text-primary"/><text x={p.x} y={p.y+3} textAnchor="middle" fontSize="8" fill="currentColor" className="text-primary-foreground">{p.order}</text></g>)}
      </svg></div>
      <div className="space-y-1 border-t pt-4 text-xs text-muted-foreground"><p>{t('soil.modelledNotice')}</p><p>{t('soil.nutrientNotice')}</p>
        <p>{t('soil.retrieved')}: {new Date(model.retrieved_at).toLocaleDateString(i18n.language)} · {model.source_version}</p>
      </div>
    </div>}
  </section>;
}
