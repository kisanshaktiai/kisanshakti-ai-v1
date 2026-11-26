import { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { FlaskConical } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useTextToSpeech } from '@/hooks/useTextToSpeech';
import { Card, CardContent } from '@/components/ui/card';
import { getSessionToken } from '@/integrations/supabase/client';
import { useAuthStore } from '@/stores/authStore';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { loadSoilState, resolveSoilSources, type SoilSourceKey } from '@/services/soil/soilReport';
import { useToast } from '@/hooks/use-toast';
import { SoilFetchPanel } from '@/components/soil/SoilFetchPanel';
import { SoilReportHeader } from '@/components/soil/SoilReportHeader';
import { SoilRecordView } from '@/components/soil/SoilRecordView';
import { SOIL_SOURCE_ICON, SOIL_SOURCE_ORDER } from '@/components/soil/soilSourceMeta';
import { SoilHealthSkeleton } from '@/components/skeletons';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';


export default function SoilHealthReport() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const reportRef = useRef<HTMLDivElement>(null);
  
  const { t, i18n } = useTranslation();
  const { session, isLoading: authLoading } = useAuthStore();
  const reduceMotion = useReducedMotion();
  const { speak, stop, isSpeaking } = useTextToSpeech();
  const onSpeak = (text: string) => { if (isSpeaking) { stop(); return; } speak(text); };
  const farmerId = session?.farmerId;
  const tenantId = session?.tenantId;
  const authenticated = !!farmerId && !!tenantId && !!getSessionToken();
  const [exporting, setExporting] = useState(false);
  const [tab, setTab] = useState<SoilSourceKey | null>(null);
  const queryClient = useQueryClient();
  const report = useQuery({
    queryKey: ['soil-report', id, farmerId, tenantId, session?.createdAt],
    enabled: !authLoading && authenticated && !!id,
    queryFn: () => loadSoilState(id!, farmerId!, tenantId!),
    refetchInterval: query => ['queued','running'].includes(query.state.data?.job?.status || '') ? 4000 : false,
    retry: false,
    staleTime: 0,
    gcTime: 0,
  });
  const state = authenticated ? report.data : null;
  // Three report types side by side; open on the most reliable one the land has.
  const sources = resolveSoilSources(state);
  const activeTab: SoilSourceKey = tab ?? (sources.lab ? 'lab' : sources.device ? 'device' : 'satellite');
  const fetchSoil = useMutation({
    mutationFn: () => loadSoilState(id!, farmerId!, tenantId!, true),
    onSuccess: () => report.refetch(),
  });
  const resetFetchSoil = fetchSoil.reset;
  useEffect(() => { resetFetchSoil(); setTab(null); }, [id, farmerId, tenantId, resetFetchSoil]);
  useEffect(() => {
    if (state?.model?.id) {
      for (const key of ['lands','analytics-data','land-chat-context','land-details','land-soil-summary']) queryClient.invalidateQueries({queryKey:[key]});
    }
  }, [state?.model?.id, queryClient]);
  const backToLand = () => navigate(id ? `/app/lands/${id}` : '/app/lands');

  const downloadAsPDF = async () => {
    if (!reportRef.current) return;
    
    try {
      setExporting(true);
      const canvas = await html2canvas(reportRef.current, {
        scale: 2,
        useCORS: true,
        logging: false,
        windowHeight: reportRef.current.scrollHeight,
      });
      
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      const imgWidth = pdfWidth;
      const imgHeight = (canvas.height * pdfWidth) / canvas.width;
      
      let heightLeft = imgHeight;
      let position = 0;
      
      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
      heightLeft -= pdfHeight;
      
      while (heightLeft > 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
        heightLeft -= pdfHeight;
      }
      
      pdf.save(`soil-health-report-${state?.land.name || 'report'}.pdf`);
      toast({ title: t('soil.pdfDone') });
    } catch (error) {
      toast({ title: t('soil.exportFailed'), variant: 'destructive' });
    } finally {
      setExporting(false);
    }
  };

  const downloadAsImage = async () => {
    if (!reportRef.current) return;
    
    try {
      setExporting(true);
      const canvas = await html2canvas(reportRef.current, {
        scale: 2,
        useCORS: true,
        logging: false,
        windowHeight: reportRef.current.scrollHeight,
      });
      
      canvas.toBlob((blob) => {
        if (blob) {
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = `soil-health-report-${state?.land.name || 'report'}.jpg`;
          link.click();
          URL.revokeObjectURL(url);
          toast({ title: t('soil.imageDone') });
        }
      }, 'image/jpeg', 0.95);
    } catch (error) {
      toast({ title: t('soil.exportFailed'), variant: 'destructive' });
    } finally {
      setExporting(false);
    }
  };

  const shareReport = async () => {
    if (!reportRef.current) return;
    
    try {
      const canvas = await html2canvas(reportRef.current, { 
        scale: 2,
        windowHeight: reportRef.current.scrollHeight,
      });
      canvas.toBlob(async (blob) => {
        if (blob && navigator.share) {
          const file = new File([blob], 'soil-report.jpg', { type: 'image/jpeg' });
          await navigator.share({
            title: t('soil.report'),
            text: `${t('soil.report')} — ${state?.land.name ?? ''}`,
            files: [file]
          });
        } else {
          toast({ title: t('soil.shareUnsupported') });
        }
      }, 'image/jpeg');
    } catch (error) {
      toast({ title: t('soil.shareFailed'), variant: 'destructive' });
    }
  };

  if (authLoading || (authenticated && !!id && report.isPending)) {
    return <SoilHealthSkeleton />;
  }

  if (!state) {
    const failed = report.isError || !authenticated || !id;
    return (
      <div className="min-h-full p-4">
        <Card className="max-w-md mx-auto">
          <CardContent className="pt-6 text-center space-y-4" role={failed ? 'alert' : 'status'}>
            <h2 className="text-xl font-semibold">{t(failed ? 'soil.loadError' : 'soil.noData')}</h2>
            <p className="text-sm text-muted-foreground">
              {t(!authenticated ? 'soil.signInRequired' : failed ? 'soil.retryHelp' : 'soil.emptyHelp')}
            </p>
            <div className="flex justify-center gap-2">
              <Button variant="outline" onClick={backToLand}>{t('soil.backToLand')}</Button>
              {authenticated && id && <Button onClick={() => report.refetch()} disabled={report.isFetching}>
                {t(report.isFetching ? 'soil.checking' : 'soil.checkAgain')}
              </Button>}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const tabStatus = (key: SoilSourceKey) => {
    const row = sources[key];
    if (key === 'satellite' && state.model) return t('soil.saved');
    if (row?.test_date) return new Date(row.test_date).toLocaleDateString(i18n.language, { day: 'numeric', month: 'short', year: '2-digit' });
    if (row) return t('soil.saved');
    return t(key === 'device' ? 'soil.comingSoon' : 'soil.notAdded');
  };

  return (
    <div className="min-h-full bg-background">
      <SoilReportHeader
        landName={state.land.name}
        exporting={exporting}
        onBack={backToLand}
        onDownloadPDF={downloadAsPDF}
        onDownloadImage={downloadAsImage}
        onShare={shareReport}
      />

      <div className="sticky top-[61px] z-30 bg-background/90 px-4 pb-2 pt-3 backdrop-blur-xl">
        <div role="tablist" aria-label={t('soil.reportTypes')} className="mx-auto grid max-w-4xl grid-cols-3 gap-1 rounded-2xl bg-muted p-1">
          {SOIL_SOURCE_ORDER.map((key) => {
            const Icon = SOIL_SOURCE_ICON[key];
            const selected = activeTab === key;
            const has = !!sources[key] || (key === 'satellite' && !!state.model);
            return (
              <button key={key} type="button" role="tab" aria-selected={selected} onClick={() => setTab(key)}
                className={cn('relative flex min-h-[60px] flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1.5 text-center transition-colors',
                  selected ? 'text-foreground' : 'text-muted-foreground')}>
                {selected && <motion.span layoutId="soil-tab" className="absolute inset-0 rounded-xl bg-background shadow-sm" transition={{ type: 'spring', stiffness: 420, damping: 34 }} />}
                <span className="relative flex items-center gap-1.5">
                  <Icon className={cn('h-4 w-4', has ? 'text-primary' : 'text-muted-foreground')} />
                  <span className={cn('h-1.5 w-1.5 rounded-full', has ? 'bg-success' : 'bg-muted-foreground/30')} aria-hidden />
                </span>
                <span className="relative text-xs font-semibold leading-tight">{t(`soil.sourceTypes.${key}`)}</span>
                <span className="relative text-[10px] leading-tight text-muted-foreground">{tabStatus(key)}</span>
              </button>
            );
          })}
        </div>
      </div>

      <main className="mx-auto max-w-4xl px-4 pb-28 pt-2">
        <AnimatePresence mode="wait">
          <motion.div key={activeTab} ref={reportRef} role="tabpanel" className="space-y-4"
            initial={{ opacity: 0, y: reduceMotion ? 0 : 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
            {activeTab === 'lab' && (sources.lab
              ? <SoilRecordView row={sources.lab} kind="lab" landName={state.land.name} ratings={state.ratings} onSpeak={onSpeak} isSpeaking={isSpeaking} />
              : <SourceEmpty icon={SOIL_SOURCE_ICON.lab} title={t('soil.noLabTitle')} help={t('soil.noLabHelp')}
                  steps={[t('soil.labStep.sample'), t('soil.labStep.lab'), t('soil.labStep.card')]} />)}
            {activeTab === 'satellite' && (
              <SoilFetchPanel state={state} savedEstimate={sources.satellite} requesting={fetchSoil.isPending}
                error={fetchSoil.error?.message || null} onFetch={() => fetchSoil.mutate()} onSpeak={onSpeak} isSpeaking={isSpeaking} />
            )}
            {activeTab === 'device' && (sources.device
              ? <SoilRecordView row={sources.device} kind="device" landName={state.land.name} ratings={state.ratings} onSpeak={onSpeak} isSpeaking={isSpeaking} />
              : <SourceEmpty icon={SOIL_SOURCE_ICON.device} title={t('soil.deviceSoonTitle')} help={t('soil.deviceSoonHelp')} />)}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}

/** A report type with nothing saved yet: what it is and, for a lab test, how to get one. */
function SourceEmpty({ icon: Icon, title, help, steps }: { icon: typeof FlaskConical; title: string; help: string; steps?: string[] }) {
  return (
    <section className="rounded-3xl border border-dashed border-border bg-card p-6" role="status">
      <div className="mx-auto grid h-16 w-16 place-items-center rounded-3xl bg-primary/10"><Icon className="h-8 w-8 text-primary" /></div>
      <h2 className="mt-4 text-center text-lg font-bold text-foreground">{title}</h2>
      <p className="mx-auto mt-2 max-w-md text-center text-sm text-muted-foreground">{help}</p>
      {steps && (
        <ol className="mx-auto mt-5 max-w-md space-y-2">
          {steps.map((step, i) => (
            <li key={step} className="flex items-center gap-3 rounded-2xl bg-muted/50 p-3">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary text-sm font-bold text-primary-foreground">{i + 1}</span>
              <span className="text-sm text-foreground">{step}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
