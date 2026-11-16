/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CROP PHOTO CAPTURE — the one diagnostic photo tool for every screen
 *
 * REPO: kisanshaktiai/kisanshakti-ai-v1  (farmer app)
 * PATH: src/components/Photo/CropPhotoCapture.tsx
 *
 * CHANGE LOG (newest first, keep entries short)
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
 * i18n: translation:cropGrowth.capture.* (en/hi/mr added 2026-09-23).
 * ═══════════════════════════════════════════════════════════════════════════
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, Images, Loader2, X, RotateCcw, AlertTriangle, CheckCircle2, MapPin } from 'lucide-react';
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
  isNativeCamera,
  queueCapture,
  quickQualityCheck,
  takeStillPhoto,
  uploadQueued,
  type BrainAnswer,
  type CapturePurpose,
  type CapturedPhoto,
  type CropPhotoUploadType,
  type DiagnoseResult,
  type RetakeReason,
  type ShotRole,
} from '@/services/cropPhotoService';

export interface CropPhotoCaptureProps {
  isOpen: boolean;
  onClose: () => void;
  purpose: CapturePurpose;
  farmerId: string;
  tenantId: string;
  /** Bound land. When absent the tool first asks which land (from `lands`). */
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
   * stops after perception and hands over the diagnosis id.
   */
  onDiagnosed?: (r: { diagnosisId: string; landId: string; farmerText: string }) => void;
  /** Other screens: the tool asks the Decision Brain and returns its answer. */
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
  const identity = { farmerId, tenantId };

  // Reset on open; release preview URLs on close.
  useEffect(() => {
    captureGeneration.current += 1;
    previewUrls.current.forEach((url) => URL.revokeObjectURL(url));
    previewUrls.current.clear();
    if (!isOpen) return;
    setLandId(props.landId);
    setPhase(props.landId ? 'capture' : 'land');
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

  const canSend = shots.length > 0 && shots.every((s) => !s.retake) && !!landId;

  const send = async () => {
    if (!landId || !canSend) return;
    const generation = captureGeneration.current;
    setProblem(null);
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
        const idx = d.retake?.photo_index ?? 0;
        setShots((prev) => prev.map((s, i) => (i === idx ? { ...s, retake: d.retake?.reason_code ?? 'generic' } : s)));
        setPhase('capture');
        return;
      }
      if (d.status === 'crop_mismatch') { setProblem(t(`${K}.cropMismatch`)); setPhase('capture'); return; }
      if (d.status === 'crop_unresolved') { setProblem(t(`${K}.cropUnresolved`)); setPhase('capture'); return; }
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

  const nextRole = ROLES[shots.length];

  return (
    <Dialog open={isOpen} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent aria-describedby={undefined} className="flex flex-col gap-0 max-w-md w-[calc(100vw-2rem)] max-h-[calc(100dvh-2rem)] p-0 overflow-hidden rounded-lg [&>button]:hidden">
        <div className="flex shrink-0 min-w-0 items-center justify-between gap-2 px-4 py-3 border-b border-border">
          <DialogTitle className="min-w-0 break-words text-base font-semibold text-foreground tracking-normal">{t(`${K}.title`)}</DialogTitle>
          <Button type="button" variant="ghost" size="icon" onClick={onClose} className="shrink-0" aria-label={t(`${K}.done`)}>
            <X className="h-5 w-5 text-muted-foreground" />
          </Button>
        </div>

        <input ref={cameraInput} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => onFile(e, true)} />
        <input ref={galleryInput} type="file" accept="image/*" className="hidden" onChange={(e) => onFile(e, false)} />

        <div className="min-h-0 min-w-0 p-4 space-y-4 overflow-y-auto overflow-x-hidden overscroll-contain break-words">
          {phase === 'land' && (
            <div className="space-y-3">
              <p className="text-sm font-medium text-foreground">{t(`${K}.chooseLand`)}</p>
              {(lands ?? []).length === 0 && <>
                <p className="text-sm text-muted-foreground">{t('cropGrowth.addLandFirst')}</p>
                <Button variant="outline" className="w-full" onClick={onClose}>{t(`${K}.done`)}</Button>
              </>}
              {(lands ?? []).map((l) => (
                <Button key={l.id} variant="outline" className="w-full justify-start h-12"
                  onClick={() => { setLandId(l.id); setPhase('capture'); }}>
                  <MapPin className="h-4 w-4 mr-2 text-primary" />{l.name}
                </Button>
              ))}
            </div>
          )}

          {phase === 'capture' && (
            <>
              {problem && (
                <div className="flex gap-2 rounded-xl bg-destructive/10 p-3 text-sm text-destructive">
                  <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" /><span>{problem}</span>
                </div>
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
                <div className={cn('rounded-xl border-2 border-dashed p-4 space-y-3',
                  shots.length === 0 ? 'border-primary bg-primary/5' : 'border-border')}>
                  <div>
                    <p className="text-sm font-semibold text-foreground">{t(`${K}.shot.${nextRole}.title`)}</p>
                    <p className="text-sm text-muted-foreground">{t(`${K}.shot.${nextRole}.hint`)}</p>
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Button className="min-h-12 h-auto min-w-0 whitespace-normal py-3 sm:flex-1" disabled={picking} onClick={() => openCamera()}>
                      <Camera className="h-5 w-5 mr-2 shrink-0" /><span className="min-w-0">{shots.length === 0 ? t('cropGrowth.takePhoto') : t(`${K}.takeNext`)}</span>
                    </Button>
                    <Button className="min-h-12 h-auto min-w-0 whitespace-normal py-3 sm:flex-1" disabled={picking} variant="outline" onClick={() => { replaceRef.current = undefined; galleryInput.current?.click(); }}>
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
            <div className="flex flex-col items-center justify-center py-10 gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">{workLabel}</p>
            </div>
          )}

          {phase === 'result' && (
            <div className="space-y-4">
              <div className="flex gap-2 rounded-xl bg-success/10 p-3">
                <CheckCircle2 className="h-5 w-5 text-success shrink-0" />
                <p className="text-sm text-foreground whitespace-pre-line">{answerText}</p>
              </div>
              <Button className="w-full h-12" onClick={onClose}>{t(`${K}.done`)}</Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default CropPhotoCapture;
