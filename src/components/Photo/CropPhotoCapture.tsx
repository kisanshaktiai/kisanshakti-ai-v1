/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CROP PHOTO CAPTURE — the one diagnostic photo tool for every screen
 *
 * REPO: kisanshaktiai/kisanshakti-ai-v1  (farmer app)
 * PATH: src/components/Photo/CropPhotoCapture.tsx
 *
 * CHANGE LOG (newest first, keep entries short)
 * 2026-11-23 — General Scan result: "How to control" panel (prevention,
 *   biological agents, chemical active ingredients with mode-of-action group,
 *   when to act, safety, label note; no brands, no doses). Shows why medicine
 *   names are held back when the server withholds them. Section order puts
 *   control right after recognition and damage.
 * 2026-11-22b — General Scan is live (Option B, isolated path). The General
 *   Scan card opens capture without a land; photos go through
 *   uploadGeneralPhoto → identifyGeneral (vision model + agronomy harness, no
 *   master tables). Result = identification card: photo, local / English /
 *   scientific name, category, host crop, server-decided certainty, what it
 *   is, how to recognise it, life cycle, damage or role, spread conditions,
 *   field checks, look-alikes. No treatment in General Scan — "Scan on my
 *   land" routes the same photos to the governed land diagnosis. Land path is
 *   unchanged. Context chip can switch scope when no land is bound. General
 *   Scan needs internet (no offline queue). Removed i18n key generalScanSoon;
 *   new keys: generalNeedsInternet, changeScan, scanOnMyLand, identifyWithGeneral,
 *   result*, category.*. After a land crop_mismatch / crop_unresolved the same
 *   photos can be identified with General Scan in one tap.
 * 2026-11-22 — Modern redesign. Camera primary, file upload below; land
 *   picker with a General Scan option (was gated).
 * 2026-10-29 — Fix shared translations, mobile overflow and preview lifecycle.
 * 2026-09-23 — v2 REWRITE. Opens with a purpose (chat_question, instascan,
 *   schedule_task, growth_tracking, land_card) and a land (or asks which land).
 *   Guides up to three shots (close-up of the problem, whole plant, field
 *   view), takes a real still photo on the phone, checks light on the device,
 *   queues offline, uploads through cropPhotoService (one encode, private
 *   storage), runs perception, and hands the diagnosis to the Decision Brain.
 *   Retake / crop-mismatch messages are i18n codes — no strings in code.
 * 2026-08-30 — v1 (single dialog for chat and schedule).
 *
 * Styling: shadcn Dialog/Button/Textarea, semantic theme tokens only
 * (primary / muted / destructive / warning / success), lucide icons, sonner.
 * i18n: translation:cropGrowth.capture.* (en/hi/mr; other languages fall back to en).
 * All identification text shown in the result comes from the model in the
 * farmer's language; the UI adds only i18n labels.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Camera, Images, Loader2, X, RotateCcw, AlertTriangle, CheckCircle2, MapPin, ScanLine, Sparkles, ChevronRight,
  Sprout, Leaf, Bug, Microscope, Worm, FlaskConical, ThermometerSun, PawPrint, ShieldCheck, ImageOff, CircleHelp,
  WifiOff, ArrowLeftRight, type LucideIcon,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import {
  askDecisionBrain,
  capturedFromFile,
  diagnosePhotos,
  getCurrentLocation,
  identifyGeneral,
  isNativeCamera,
  queueCapture,
  quickQualityCheck,
  takeStillPhoto,
  uploadGeneralPhoto,
  uploadQueued,
  type BrainAnswer,
  type CapturePurpose,
  type CapturedPhoto,
  type CropPhotoUploadType,
  type DiagnoseResult,
  type GeneralIdentification,
  type GeneralManagement,
  type GeneralScanCategory,
  type GeneralScanResult,
  type RetakeReason,
  type ShotRole,
} from '@/services/cropPhotoService';

export interface CropPhotoCaptureProps {
  isOpen: boolean;
  onClose: () => void;
  purpose: CapturePurpose;
  farmerId: string;
  tenantId: string;
  /** Bound land. When absent the tool first asks which land (from `lands`) or General Scan. */
  landId?: string;
  lands?: Array<{ id: string; name: string }>;
  sessionId?: string;
  scheduleId?: string;
  taskId?: string;
  uploadType?: CropPhotoUploadType;
  /** Schedule proof needs GPS; a question about a leaf does not. */
  requireLocation?: boolean;
  /** Photos/text already picked by the caller (e.g. chat attachments). */
  initialFiles?: File[];
  initialText?: string;
  /**
   * Chat screens send the brain turn through their own pipeline: the tool
   * stops after perception and hands over the diagnosis id. (Land scans only.)
   */
  onDiagnosed?: (r: { diagnosisId: string; landId: string; farmerText: string }) => void;
  /** Other screens: the tool asks the Decision Brain and returns its answer. (Land scans only.) */
  onAnswer?: (r: { diagnosisId: string; landId: string; answer: BrainAnswer }) => void;
}

const ROLES: ShotRole[] = ['symptom_closeup', 'whole_plant', 'field_view'];
const K = 'cropGrowth.capture';

interface Shot {
  role: ShotRole;
  photo: CapturedPhoto;
  retake: RetakeReason | 'generic' | null;
}

type Phase = 'land' | 'capture' | 'working' | 'result';
type ScanMode = 'land' | 'general';

const CATEGORY_ICON: Record<GeneralScanCategory, LucideIcon> = {
  crop_plant: Sprout,
  weed: Leaf,
  insect_pest: Bug,
  mite_pest: Bug,
  pest_damage: Bug,
  fungal_disease: Microscope,
  bacterial_disease: Microscope,
  viral_disease: Microscope,
  nematode_damage: Worm,
  nutrient_deficiency: FlaskConical,
  abiotic_stress: ThermometerSun,
  animal_damage: PawPrint,
  beneficial_organism: ShieldCheck,
  not_agricultural: ImageOff,
  unknown: CircleHelp,
};

export function CropPhotoCapture(props: CropPhotoCaptureProps) {
  const {
    isOpen, onClose, purpose, farmerId, tenantId, lands, sessionId, scheduleId, taskId,
    uploadType, requireLocation, initialFiles, initialText, onDiagnosed, onAnswer,
  } = props;
  const { t, i18n } = useTranslation();
  const [landId, setLandId] = useState<string | undefined>(props.landId);
  const [phase, setPhase] = useState<Phase>(props.landId ? 'capture' : 'land');
  const [shots, setShots] = useState<Shot[]>([]);
  const [text, setText] = useState(initialText ?? '');
  const [workLabel, setWorkLabel] = useState<string>('');
  const [problem, setProblem] = useState<string | null>(null);
  const [answerText, setAnswerText] = useState<string>('');
  const cameraInput = useRef<HTMLInputElement>(null);
  const galleryInput = useRef<HTMLInputElement>(null);
  const previewUrls = useRef(new Set<string>());
  const captureGeneration = useRef(0);
  const [picking, setPicking] = useState(false);
  // Scan scope: 'land' = governed diagnosis against the chosen land's crop;
  // 'general' = land-less identification of any crop/weed/pest/disease.
  const [scanMode, setScanMode] = useState<ScanMode>('land');
  const [offlineNote, setOfflineNote] = useState(false);
  const [general, setGeneral] = useState<GeneralScanResult | null>(null);
  // Land scan said the photo does not match the land's crop → offer General Scan with the same photos.
  const [offerGeneral, setOfferGeneral] = useState(false);
  const identity = { farmerId, tenantId };
  const landBound = !!props.landId;

  // Reset on open; release preview URLs on close.
  useEffect(() => {
    captureGeneration.current += 1;
    previewUrls.current.forEach((url) => URL.revokeObjectURL(url));
    previewUrls.current.clear();
    if (!isOpen) return;
    setLandId(props.landId);
    setPhase(props.landId ? 'capture' : 'land');
    setScanMode('land');
    setOfflineNote(false);
    setGeneral(null);
    setOfferGeneral(false);
    setShots([]);
    setText(initialText ?? '');
    setProblem(null);
    setAnswerText('');
    setPicking(false);
  }, [isOpen, props.landId, initialText, farmerId, tenantId]);
  useEffect(() => () => {
    captureGeneration.current += 1;
    previewUrls.current.forEach((url) => URL.revokeObjectURL(url));
    previewUrls.current.clear();
  }, []);

  const addPhoto = useCallback(async (photo: CapturedPhoto, replaceIndex?: number) => {
    const generation = captureGeneration.current;
    previewUrls.current.add(photo.previewUrl);
    const reason = await quickQualityCheck(photo.blob).catch(() => null);
    if (generation !== captureGeneration.current) {
      URL.revokeObjectURL(photo.previewUrl);
      previewUrls.current.delete(photo.previewUrl);
      return;
    }
    setShots((prev) => {
      const next = [...prev];
      const role = replaceIndex !== undefined ? prev[replaceIndex]?.role : ROLES[prev.length];
      if (!role) return prev;
      const shot: Shot = { role, photo, retake: reason };
      if (replaceIndex !== undefined) next[replaceIndex] = shot; else next.push(shot);
      return next;
    });
  }, []);

  // Pre-picked files (chat attachments) enter the same path.
  useEffect(() => {
    if (!isOpen || !initialFiles?.length) return;
    const generation = captureGeneration.current;
    void (async () => {
      for (const file of initialFiles.slice(0, ROLES.length)) {
        if (generation !== captureGeneration.current) return;
        await addPhoto(capturedFromFile(file, false));
      }
    })();
  }, [isOpen, initialFiles, addPhoto, props.landId, farmerId, tenantId]);

  const replaceRef = useRef<number | undefined>(undefined);
  const openCamera = async (replaceIndex?: number) => {
    if (picking) return;
    replaceRef.current = replaceIndex;
    if (isNativeCamera()) {
      const generation = captureGeneration.current;
      setPicking(true);
      try {
        const photo = await takeStillPhoto();
        if (photo && generation === captureGeneration.current) await addPhoto(photo, replaceIndex);
        else if (photo) URL.revokeObjectURL(photo.previewUrl);
      } finally {
        if (generation === captureGeneration.current) setPicking(false);
      }
      return;
    }
    cameraInput.current?.click();
  };
  const onFile = async (e: React.ChangeEvent<HTMLInputElement>, fromCamera: boolean) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) await addPhoto(capturedFromFile(file, fromCamera), replaceRef.current);
    replaceRef.current = undefined;
  };

  const removeShot = (i: number) => setShots((prev) => prev.filter((_, idx) => idx !== i).map((s, idx) => ({ ...s, role: ROLES[idx] })));

  // ── Scope switching ─────────────────────────────────────────────────────
  const chooseGeneral = () => {
    if (!navigator.onLine) {
      if (phase === 'capture') setProblem(t(`${K}.generalNeedsInternet`)); else setOfflineNote(true);
      return;
    }
    setOfflineNote(false);
    setOfferGeneral(false);
    setScanMode('general');
    setLandId(undefined);
    setProblem(null);
    setPhase('capture');
  };
  const chooseLand = (id: string) => {
    setOfflineNote(false);
    setScanMode('land');
    setLandId(id);
    setProblem(null);
    setGeneral(null);
    setPhase('capture');
  };
  const backToPicker = () => {
    setProblem(null);
    setGeneral(null);
    setPhase('land');
  };

  const shotsOk = shots.length > 0 && shots.every((s) => !s.retake);
  const canSend = shotsOk && (scanMode === 'general' || !!landId);

  const markRetake = (idx: number | null | undefined, code: RetakeReason | null | undefined) => {
    const i = idx ?? 0;
    setShots((prev) => prev.map((s, k) => (k === i ? { ...s, retake: code ?? 'generic' } : s)));
  };

  // ── General Scan: identification only, online only ──────────────────────
  const sendGeneral = async () => {
    const generation = captureGeneration.current;
    setProblem(null);
    if (!navigator.onLine) { setProblem(t(`${K}.generalNeedsInternet`)); return; }
    setPhase('working');
    try {
      const location = await getCurrentLocation();
      if (generation !== captureGeneration.current) return;
      if (requireLocation && !location) {
        toast.error(t('cropGrowth.pleaseAddLocation'));
        setPhase('capture');
        return;
      }
      setWorkLabel(t(`${K}.uploading`));
      const uploads: Array<{ upload_id: string; shot_role: ShotRole }> = [];
      for (const s of shots) {
        const uploadId = await uploadGeneralPhoto(s.photo, { id: identity, purpose, shotRole: s.role, location });
        if (generation !== captureGeneration.current) return;
        uploads.push({ upload_id: uploadId, shot_role: s.role });
      }
      setWorkLabel(t(`${K}.diagnosing`));
      const r = await identifyGeneral({
        id: identity, purpose, photos: uploads, language: i18n.language || 'en', farmerText: text,
      });
      if (generation !== captureGeneration.current) return;
      if (r.status === 'retake_requested') {
        markRetake(r.retake?.photo_index, r.retake?.reason_code);
        setPhase('capture');
        return;
      }
      if ((r.status !== 'completed' && r.status !== 'needs_follow_up') || !r.identification) {
        setProblem(t(`${K}.failed`));
        setPhase('capture');
        return;
      }
      setGeneral(r);
      setPhase('result');
    } catch (e) {
      if (generation !== captureGeneration.current) return;
      console.error('[CropPhotoCapture] general scan failed', e);
      setProblem(t(`${K}.failed`));
      setPhase('capture');
    }
  };

  // ── Land scan: governed diagnosis + Decision Brain (unchanged) ──────────
  const sendLand = async () => {
    if (!landId) return;
    const generation = captureGeneration.current;
    setProblem(null);
    setOfferGeneral(false);
    setPhase('working');
    try {
      const location = await getCurrentLocation();
      if (generation !== captureGeneration.current) return;
      if (requireLocation && !location) {
        toast.error(t('cropGrowth.pleaseAddLocation'));
        setPhase('capture');
        return;
      }
      // 1. Queue first — nothing is lost if the network drops.
      const queued = [];
      for (const s of shots) {
        queued.push(await queueCapture(s.photo, {
          id: identity, landId, purpose, shotRole: s.role,
          scheduleId: scheduleId ?? null, taskId: taskId ?? null, subjectType: uploadType ?? null, location,
        }));
        if (generation !== captureGeneration.current) return;
      }
      if (!navigator.onLine) {
        toast.success(t(`${K}.savedOffline`));
        onClose();
        return;
      }
      // 2. Upload (one encode each, private storage).
      setWorkLabel(t(`${K}.uploading`));
      const uploads = [];
      for (let i = 0; i < queued.length; i++) {
        uploads.push({ upload_id: await uploadQueued(queued[i]), shot_role: shots[i].role });
        if (generation !== captureGeneration.current) return;
      }
      // 3. Perception.
      setWorkLabel(t(`${K}.diagnosing`));
      const language = i18n.language || 'en';
      const d: DiagnoseResult = await diagnosePhotos({
        id: identity, landId, purpose, photos: uploads, taskId: taskId ?? null,
        sessionId: sessionId ?? null, language, farmerText: text,
      });
      if (generation !== captureGeneration.current) return;
      if (d.status === 'retake_requested') {
        markRetake(d.retake?.photo_index, d.retake?.reason_code);
        setPhase('capture');
        return;
      }
      if (d.status === 'crop_mismatch') { setProblem(t(`${K}.cropMismatch`)); setOfferGeneral(true); setPhase('capture'); return; }
      if (d.status === 'crop_unresolved') { setProblem(t(`${K}.cropUnresolved`)); setOfferGeneral(true); setPhase('capture'); return; }
      if (d.status !== 'completed' || !d.diagnosis_id) { setProblem(t(`${K}.failed`)); setPhase('capture'); return; }

      // 4. The Decision Brain decides the answer.
      if (onDiagnosed) {
        onDiagnosed({ diagnosisId: d.diagnosis_id, landId, farmerText: text });
        onClose();
        return;
      }
      setWorkLabel(t(`${K}.thinking`));
      const answer = await askDecisionBrain({
        id: identity, landId, sessionId: sessionId ?? null, language, diagnosisId: d.diagnosis_id, farmerText: text,
      });
      if (generation !== captureGeneration.current) return;
      setAnswerText(typeof answer?.response === 'string' ? answer.response : '');
      setPhase('result');
      onAnswer?.({ diagnosisId: d.diagnosis_id, landId, answer });
    } catch (e) {
      if (generation !== captureGeneration.current) return;
      console.error('[CropPhotoCapture] send failed', e);
      setProblem(t(`${K}.failed`));
      setPhase('capture');
    }
  };

  const send = () => {
    if (!canSend) return;
    void (scanMode === 'general' ? sendGeneral() : sendLand());
  };

  const nextRole = ROLES[shots.length];
  const landName = (lands ?? []).find((l) => l.id === landId)?.name ?? t(`${K}.thisLand`);

  return (
    <Dialog open={isOpen} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent aria-describedby={undefined} className="flex flex-col gap-0 max-w-md w-[calc(100vw-2rem)] max-h-[calc(100dvh-2rem)] p-0 overflow-hidden rounded-lg [&>button]:hidden">
        <div className="flex shrink-0 min-w-0 items-center justify-between gap-2 px-4 py-3 border-b border-border">
          <DialogTitle className="min-w-0 break-words text-base font-semibold text-foreground tracking-normal">
            {scanMode === 'general' && phase !== 'land' ? t(`${K}.generalScan`) : t(`${K}.title`)}
          </DialogTitle>
          <Button type="button" variant="ghost" size="icon" onClick={onClose} className="shrink-0" aria-label={t(`${K}.done`)}>
            <X className="h-5 w-5 text-muted-foreground" />
          </Button>
        </div>

        <input ref={cameraInput} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => onFile(e, true)} />
        <input ref={galleryInput} type="file" accept="image/*" className="hidden" onChange={(e) => onFile(e, false)} />

        <div className="min-h-0 min-w-0 p-4 space-y-4 overflow-y-auto overflow-x-hidden overscroll-contain break-words">
          {phase === 'land' && (
            <div className="space-y-4">
              {/* General Scan — land-less identification of any crop / weed / pest / disease. */}
              <button
                type="button"
                onClick={chooseGeneral}
                className="group relative w-full overflow-hidden rounded-2xl border border-primary/30 bg-primary/5 p-4 text-left transition-colors hover:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div className="flex items-center gap-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                    <Sparkles className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-foreground">{t(`${K}.generalScan`)}</p>
                    <p className="text-xs text-muted-foreground">{t(`${K}.generalScanHint`)}</p>
                  </div>
                  <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                </div>
              </button>
              {offlineNote && (
                <div role="status" className="flex gap-2 rounded-xl bg-warning/10 p-3 text-xs text-foreground">
                  <WifiOff className="h-4 w-4 mt-0.5 shrink-0 text-warning" />
                  <span>{t(`${K}.generalNeedsInternet`)}</span>
                </div>
              )}

              <div className="flex items-center gap-3 pt-1">
                <span className="h-px flex-1 bg-border" />
                <span className="text-xs font-medium text-muted-foreground">{t(`${K}.orChooseLand`)}</span>
                <span className="h-px flex-1 bg-border" />
              </div>

              {(lands ?? []).length === 0 && (
                <p className="text-sm text-muted-foreground">{t('cropGrowth.addLandFirst')}</p>
              )}
              <div className="space-y-2">
                {(lands ?? []).map((l) => (
                  <button
                    key={l.id}
                    type="button"
                    onClick={() => chooseLand(l.id)}
                    className="flex w-full items-center gap-3 rounded-xl border border-border bg-card p-3 text-left transition-colors hover:border-primary/50 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <MapPin className="h-5 w-5" />
                    </span>
                    <span className="min-w-0 flex-1 break-words text-sm font-medium text-foreground">{l.name}</span>
                    <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {phase === 'capture' && (
            <>
              {/* Context chip: which scope this scan belongs to. Tappable when no land is bound. */}
              <div className="flex min-w-0 items-center gap-2">
                <div className="flex min-w-0 items-center gap-2 rounded-full border border-border bg-muted/50 px-3 py-1.5 text-xs font-medium text-muted-foreground">
                  {scanMode === 'general'
                    ? <><Sparkles className="h-3.5 w-3.5 shrink-0 text-primary" /><span className="truncate">{t(`${K}.generalScan`)}</span></>
                    : <><MapPin className="h-3.5 w-3.5 shrink-0 text-primary" /><span className="truncate">{landName}</span></>}
                </div>
                {!landBound && (
                  <Button type="button" variant="ghost" size="sm" className="h-8 shrink-0 gap-1 px-2 text-xs text-primary" onClick={backToPicker}>
                    <ArrowLeftRight className="h-3.5 w-3.5" />{t(`${K}.changeScan`)}
                  </Button>
                )}
              </div>
              {problem && (
                <div role="alert" className="flex gap-2 rounded-xl bg-destructive/10 p-3 text-sm text-destructive">
                  <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" /><span>{problem}</span>
                </div>
              )}
              {offerGeneral && scanMode === 'land' && (
                <Button type="button" variant="outline" className="h-11 w-full rounded-xl border-primary/40" onClick={chooseGeneral}>
                  <Sparkles className="h-4 w-4 mr-2 text-primary" />{t(`${K}.identifyWithGeneral`)}
                </Button>
              )}

              {shots.map((s, i) => (
                <div key={s.photo.captureId} className="rounded-xl border border-border overflow-hidden">
                  <img src={s.photo.previewUrl} alt={t(`${K}.shot.${s.role}.title`)} className="w-full max-h-56 object-cover" />
                  <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                    <span className="min-w-0 text-sm font-medium text-foreground">{t(`${K}.shot.${s.role}.title`)}</span>
                    <div className="flex shrink-0 gap-1">
                      <Button size="icon" variant="ghost" disabled={picking} title={t(`${K}.retakeThis`)} aria-label={t(`${K}.retakeThis`)} onClick={() => openCamera(i)}><RotateCcw className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" title={t(`${K}.remove`)} aria-label={t(`${K}.remove`)} onClick={() => removeShot(i)}><X className="h-4 w-4" /></Button>
                    </div>
                  </div>
                  {s.retake && (
                    <p className="px-3 pb-3 text-sm text-warning">{t(`${K}.retake.${s.retake}`)}</p>
                  )}
                </div>
              ))}

              {nextRole && (
                <div className={cn('rounded-2xl border-2 border-dashed p-4 space-y-4 transition-colors',
                  shots.length === 0 ? 'border-primary/60 bg-primary/5' : 'border-border')}>
                  <div className="flex items-start gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <ScanLine className="h-5 w-5" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground">{t(`${K}.shot.${nextRole}.title`)}</p>
                      <p className="text-sm text-muted-foreground">{t(`${K}.shot.${nextRole}.hint`)}</p>
                    </div>
                  </div>
                  {/* Two clear options: camera on top, file upload directly below. */}
                  <div className="flex flex-col gap-2.5">
                    <Button className="h-14 w-full min-w-0 whitespace-normal rounded-xl text-base font-semibold shadow-sm" disabled={picking} onClick={() => openCamera()}>
                      {picking ? <Loader2 className="h-5 w-5 mr-2 shrink-0 animate-spin" /> : <Camera className="h-5 w-5 mr-2 shrink-0" />}
                      <span className="min-w-0">{shots.length === 0 ? t('cropGrowth.takePhoto') : t(`${K}.takeNext`)}</span>
                    </Button>
                    <Button className="h-12 w-full min-w-0 whitespace-normal rounded-xl" disabled={picking} variant="outline" onClick={() => { replaceRef.current = undefined; galleryInput.current?.click(); }}>
                      <Images className="h-5 w-5 mr-2 shrink-0" /><span className="min-w-0">{t(`${K}.addFromGallery`)}</span>
                    </Button>
                  </div>
                </div>
              )}

              {shots.length > 0 && (
                <>
                  <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder={t(`${K}.yourWords`)} rows={3} />
                  <Button className="w-full h-12 text-base" disabled={!canSend} onClick={send}>{t(`${K}.send`)}</Button>
                </>
              )}
            </>
          )}

          {phase === 'working' && (
            <div className="flex flex-col items-center justify-center py-10 gap-3" role="status" aria-live="polite">
              {shots[0] && (
                <div className="relative h-24 w-24 overflow-hidden rounded-2xl border border-border">
                  <img src={shots[0].photo.previewUrl} alt="" className="h-full w-full object-cover" />
                  <span className="ks-scan-sweep pointer-events-none absolute inset-x-0 h-1/3 bg-gradient-to-b from-transparent via-primary/40 to-transparent motion-reduce:hidden" />
                </div>
              )}
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">{workLabel}</p>
            </div>
          )}

          {phase === 'result' && scanMode === 'land' && (
            <div className="space-y-4">
              <div className="flex gap-2 rounded-xl bg-success/10 p-3">
                <CheckCircle2 className="h-5 w-5 text-success shrink-0" />
                <p className="text-sm text-foreground whitespace-pre-line">{answerText}</p>
              </div>
              <Button className="w-full h-12" onClick={onClose}>{t(`${K}.done`)}</Button>
            </div>
          )}

          {phase === 'result' && scanMode === 'general' && general?.identification && (
            <GeneralResultCard
              id={general.identification}
              status={general.status}
              photoUrl={shots[0]?.photo.previewUrl}
              canAddPhoto={shots.length < ROLES.length}
              canScanLand={!landBound && (lands ?? []).length > 0}
              onAddPhoto={() => { setGeneral(null); setPhase('capture'); }}
              onScanLand={() => { setGeneral(null); setScanMode('land'); setPhase('land'); }}
              onDone={onClose}
            />
          )}
        </div>
        <style>{`
          @keyframes ks-scan-sweep { 0% { top: -33%; } 100% { top: 100%; } }
          .ks-scan-sweep { animation: ks-scan-sweep 1.6s ease-in-out infinite; }
        `}</style>
      </DialogContent>
    </Dialog>
  );
}

// ── General Scan result — an identification card, not a prescription ─────

interface GeneralResultCardProps {
  id: GeneralIdentification;
  status: GeneralScanResult['status'];
  photoUrl?: string;
  canAddPhoto: boolean;
  canScanLand: boolean;
  onAddPhoto: () => void;
  onScanLand: () => void;
  onDone: () => void;
}

export function GeneralResultCard({ id, status, photoUrl, canAddPhoto, canScanLand, onAddPhoto, onScanLand, onDone }: GeneralResultCardProps) {
  const { t } = useTranslation();
  const Icon = CATEGORY_ICON[id.category] ?? CircleHelp;
  const sure = status === 'completed' && !id.abstained;
  const p = id.primary;
  const headline = p.local_name || p.common_name_en || t(`${K}.category.${id.category}`);
  const showEnglish = !!p.common_name_en && p.common_name_en !== headline;
  const pct = Math.round(Math.max(0, Math.min(1, p.confidence)) * 100);
  const c = id.farmer_card;
  const hostName = id.host_crop ? (id.host_crop.local_name || id.host_crop.common_name_en) : null;

  return (
    <article className="space-y-5" aria-live="polite">
      {/* Specimen: the farmer's own photo with the name set on it. */}
      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        {photoUrl && (
          <div className="relative">
            <img src={photoUrl} alt="" className="h-48 w-full object-cover" />
            <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-background/90 px-2.5 py-1 text-xs font-medium text-foreground backdrop-blur">
              <Icon className="h-3.5 w-3.5 text-primary" />{t(`${K}.category.${id.category}`)}
            </span>
          </div>
        )}
        <div className="space-y-3 p-4">
          {!photoUrl && (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Icon className="h-3.5 w-3.5 text-primary" />{t(`${K}.category.${id.category}`)}
            </span>
          )}
          <div className="space-y-0.5">
            <h3 className="text-2xl font-bold leading-tight text-foreground">{headline}</h3>
            {showEnglish && <p className="text-sm text-foreground/80">{p.common_name_en}</p>}
            {p.scientific_name && <p className="font-serif text-sm italic text-muted-foreground">{p.scientific_name}</p>}
            {hostName && (
              <p className="flex items-center gap-1.5 pt-1 text-xs text-muted-foreground">
                <Sprout className="h-3.5 w-3.5 text-primary" />{t(`${K}.resultOnCrop`, { crop: hostName })}
              </p>
            )}
          </div>

          {/* Certainty — the server decides completed vs needs_follow_up; the UI only colours it. */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">{t(`${K}.resultConfidence`)}</span>
              <span className={cn('font-semibold tabular-nums', sure ? 'text-success' : 'text-warning')}>{pct}%</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={t(`${K}.resultConfidence`)}>
              <div className={cn('h-full rounded-full', sure ? 'bg-success' : 'bg-warning')} style={{ width: `${pct}%` }} />
            </div>
          </div>
        </div>
      </div>

      {!sure && (
        <div className="space-y-3 rounded-xl bg-warning/10 p-3">
          <div className="flex gap-2">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-warning" />
            <div className="min-w-0 space-y-1 text-sm text-foreground">
              <p className="font-medium">{t(`${K}.resultNotSure`)}</p>
              {id.another_photo.reason_local && <p className="text-muted-foreground">{id.another_photo.reason_local}</p>}
              {id.another_photo.shot_role && (
                <p className="text-muted-foreground">{t(`${K}.shot.${id.another_photo.shot_role}.hint`)}</p>
              )}
            </div>
          </div>
          {canAddPhoto && (
            <Button variant="outline" className="h-11 w-full rounded-xl" onClick={onAddPhoto}>
              <Camera className="h-4 w-4 mr-2" />{t(`${K}.takeNext`)}
            </Button>
          )}
        </div>
      )}

      {c.summary_local && <Section title={t(`${K}.resultWhatItIs`)}><p>{c.summary_local}</p></Section>}
      {c.identification_marks_local.length > 0 && (
        <Section title={t(`${K}.resultHowToRecognise`)}><Bullets items={c.identification_marks_local} /></Section>
      )}
      {c.damage_or_role_local && <Section title={t(`${K}.resultDamage`)}><p>{c.damage_or_role_local}</p></Section>}
      {id.management?.applicable && <ControlPanel m={id.management} />}
      {c.spread_conditions_local && <Section title={t(`${K}.resultSpread`)}><p>{c.spread_conditions_local}</p></Section>}
      {c.life_cycle_local && <Section title={t(`${K}.resultLifeCycle`)}><p>{c.life_cycle_local}</p></Section>}
      {c.field_checks_local.length > 0 && (
        <Section title={t(`${K}.resultFieldChecks`)}><Bullets items={c.field_checks_local} /></Section>
      )}

      {id.alternatives.length > 0 && (
        <Section title={t(`${K}.resultCouldAlsoBe`)}>
          <ul className="divide-y divide-border rounded-xl border border-border">
            {id.alternatives.map((a, i) => {
              const AltIcon = CATEGORY_ICON[a.category] ?? CircleHelp;
              const name = a.local_name || a.common_name_en || t(`${K}.category.${a.category}`);
              return (
                <li key={`${name}-${i}`} className="flex gap-3 p-3">
                  <AltIcon className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 space-y-0.5">
                    <p className="font-medium text-foreground">
                      {name}
                      {a.scientific_name && <i className="ml-1.5 font-serif text-xs font-normal text-muted-foreground">{a.scientific_name}</i>}
                    </p>
                    {a.how_to_tell_apart_local && <p className="text-muted-foreground">{a.how_to_tell_apart_local}</p>}
                  </div>
                </li>
              );
            })}
          </ul>
        </Section>
      )}

      {/* General Scan identifies; treatment comes only from the governed land diagnosis. */}
      <div className="space-y-2.5 border-t border-border pt-4">
        <p className="flex gap-2 text-xs text-muted-foreground">
          <MapPin className="h-3.5 w-3.5 mt-0.5 shrink-0 text-primary" />{t(`${K}.resultTreatmentHint`)}
        </p>
        {canScanLand && (
          <Button variant="outline" className="h-11 w-full rounded-xl" onClick={onScanLand}>
            <MapPin className="h-4 w-4 mr-2" />{t(`${K}.scanOnMyLand`)}
          </Button>
        )}
        <Button className="h-12 w-full rounded-xl" onClick={onDone}>{t(`${K}.done`)}</Button>
      </div>
    </article>
  );
}

// ── How to control — prevention first, then biological, then chemical ingredients ──
function ControlPanel({ m }: { m: GeneralManagement }) {
  const { t } = useTranslation();
  const hasProducts = m.biological.length > 0 || m.chemical.length > 0;
  return (
    <section className="space-y-4 rounded-2xl border border-primary/30 bg-primary/5 p-4 text-sm leading-relaxed text-foreground">
      <h4 className="flex items-center gap-2 text-base font-semibold text-foreground">
        <ShieldCheck className="h-5 w-5 shrink-0 text-primary" />{t(`${K}.resultControl`)}
      </h4>

      {m.action_threshold_local && (
        <div className="space-y-1">
          <p className="font-semibold">{t(`${K}.resultWhenToAct`)}</p>
          <p>{m.action_threshold_local}</p>
        </div>
      )}

      {m.prevention_local.length > 0 && (
        <div className="space-y-1.5">
          <p className="flex items-center gap-1.5 font-semibold"><Sprout className="h-4 w-4 text-primary" />{t(`${K}.resultPrevention`)}</p>
          <Bullets items={m.prevention_local} />
        </div>
      )}

      {m.biological.length > 0 && (
        <div className="space-y-1.5">
          <p className="flex items-center gap-1.5 font-semibold"><Leaf className="h-4 w-4 text-primary" />{t(`${K}.resultBiological`)}</p>
          <ul className="space-y-2">
            {m.biological.map((b, i) => (
              <li key={`${b.agent}-${i}`} className="rounded-xl bg-background/70 p-3">
                <p className="font-medium text-foreground">{b.agent}</p>
                {b.how_local && <p className="text-muted-foreground">{b.how_local}</p>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {m.chemical.length > 0 && (
        <div className="space-y-1.5">
          <p className="flex items-center gap-1.5 font-semibold"><FlaskConical className="h-4 w-4 text-primary" />{t(`${K}.resultChemical`)}</p>
          <ul className="space-y-2">
            {m.chemical.map((x, i) => (
              <li key={`${x.active_ingredient}-${i}`} className="rounded-xl bg-background/70 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold text-foreground">{x.active_ingredient}</p>
                  {x.moa_group && (
                    <span className="rounded-md border border-border px-1.5 py-0.5 text-xs text-muted-foreground" title={t(`${K}.resultMoaGroup`)}>
                      {x.moa_group}
                    </span>
                  )}
                </div>
                {x.how_local && <p className="text-muted-foreground">{x.how_local}</p>}
                {x.watch_list && <p className="pt-1 text-xs text-warning">{t(`${K}.resultWatchList`)}</p>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {m.products_withheld && (
        <p className="flex gap-2 rounded-xl bg-warning/10 p-3 text-foreground">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-warning" />
          {t(m.products_withheld === 'not_sure' ? `${K}.resultProductsNeedSure` : `${K}.resultProductsUnavailable`)}
        </p>
      )}

      {(m.safety_local || hasProducts) && (
        <div className="space-y-1.5 border-t border-primary/20 pt-3">
          {m.safety_local && (
            <p className="flex gap-2"><AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-warning" /><span>{m.safety_local}</span></p>
          )}
          {hasProducts && <p className="text-xs text-muted-foreground">{t(`${K}.resultLabelNote`)}</p>}
        </div>
      )}
    </section>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-1.5 text-sm leading-relaxed text-foreground">
      <h4 className="text-sm font-semibold text-foreground">{title}</h4>
      {children}
    </section>
  );
}

function Bullets({ items }: { items: string[] }) {
  return (
    <ul className="space-y-1.5">
      {items.map((x, i) => (
        <li key={i} className="flex gap-2">
          <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
          <span className="min-w-0">{x}</span>
        </li>
      ))}
    </ul>
  );
}

export default CropPhotoCapture;
