/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CROP PHOTO CAPTURE — the one diagnostic photo tool for every screen
 *
 * REPO: kisanshaktiai/kisanshakti-ai-v1  (farmer app)
 * PATH: src/components/Photo/CropPhotoCapture.tsx
 *
 * CHANGE LOG (newest first, keep entries short)
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
 * i18n: cropGrowth:cropGrowth.capture.* (en/hi/mr added 2026-09-23).
 * ═══════════════════════════════════════════════════════════════════════════
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, Images, Loader2, X, RotateCcw, AlertTriangle, CheckCircle2, MapPin } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Dialog, DialogContent } from '@/components/ui/dialog';
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
const NS = 'cropGrowth';
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
  const { t, i18n } = useTranslation(NS);
  const [landId, setLandId] = useState<string | undefined>(props.landId);
  const [phase, setPhase] = useState<Phase>(props.landId ? 'capture' : 'land');
  const [shots, setShots] = useState<Shot[]>([]);
  const [text, setText] = useState(initialText ?? '');
  const [workLabel, setWorkLabel] = useState<string>('');
  const [problem, setProblem] = useState<string | null>(null);
  const [answerText, setAnswerText] = useState<string>('');
  const cameraInput = useRef<HTMLInputElement>(null);
  const galleryInput = useRef<HTMLInputElement>(null);
  const identity = { farmerId, tenantId };

  // Reset on open; release preview URLs on close.
  useEffect(() => {
    if (!isOpen) return;
    setLandId(props.landId);
    setPhase(props.landId ? 'capture' : 'land');
    setShots([]);
    setText(initialText ?? '');
    setProblem(null);
    setAnswerText('');
  }, [isOpen, props.landId, initialText]);
  useEffect(() => () => shots.forEach((s) => URL.revokeObjectURL(s.photo.previewUrl)), [shots]);

  const addPhoto = useCallback(async (photo: CapturedPhoto, replaceIndex?: number) => {
    const reason = await quickQualityCheck(photo.blob).catch(() => null);
    setShots((prev) => {
      const next = [...prev];
      const role = replaceIndex !== undefined ? prev[replaceIndex].role : ROLES[prev.length];
      if (!role) return prev;
      const shot: Shot = { role, photo, retake: reason };
      if (replaceIndex !== undefined) next[replaceIndex] = shot; else next.push(shot);
      return next;
    });
  }, []);

  // Pre-picked files (chat attachments) enter the same path.
  useEffect(() => {
    if (!isOpen || !initialFiles?.length) return;
    initialFiles.slice(0, ROLES.length).forEach((f) => { void addPhoto(capturedFromFile(f, false)); });
  }, [isOpen, initialFiles, addPhoto]);

  const replaceRef = useRef<number | undefined>(undefined);
  const openCamera = async (replaceIndex?: number) => {
    replaceRef.current = replaceIndex;
    if (isNativeCamera()) {
      const photo = await takeStillPhoto();
      if (photo) await addPhoto(photo, replaceIndex);
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
    setProblem(null);
    setPhase('working');
    try {
      const location = await getCurrentLocation();
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
      }
      // 3. Perception.
      setWorkLabel(t(`${K}.diagnosing`));
      const language = i18n.language || 'en';
      const d: DiagnoseResult = await diagnosePhotos({
        id: identity, landId, purpose, photos: uploads, taskId: taskId ?? null,
        sessionId: sessionId ?? null, language, farmerText: text,
      });
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
      setAnswerText(typeof answer?.response === 'string' ? answer.response : '');
      setPhase('result');
      onAnswer?.({ diagnosisId: d.diagnosis_id, landId, answer });
    } catch (e) {
      console.error('[CropPhotoCapture] send failed', e);
      setProblem(t(`${K}.failed`));
      setPhase('capture');
    }
  };

  const nextRole = ROLES[shots.length];

  return (
    <Dialog open={isOpen} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md w-[95vw] p-0 overflow-hidden rounded-2xl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 className="text-base font-semibold text-foreground">{t(`${K}.title`)}</h2>
          <button type="button" onClick={onClose} className="p-1 rounded-full hover:bg-muted" aria-label={t(`${K}.done`)}>
            <X className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>

        <input ref={cameraInput} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => onFile(e, true)} />
        <input ref={galleryInput} type="file" accept="image/*" className="hidden" onChange={(e) => onFile(e, false)} />

        <div className="p-4 space-y-4 max-h-[75vh] overflow-y-auto">
          {phase === 'land' && (
            <div className="space-y-3">
              <p className="text-sm font-medium text-foreground">{t(`${K}.chooseLand`)}</p>
              {(lands ?? []).length === 0 && <p className="text-sm text-muted-foreground">{t('cropGrowth.addLandFirst')}</p>}
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
                  <div className="flex items-center justify-between px-3 py-2">
                    <span className="text-sm font-medium text-foreground">{t(`${K}.shot.${s.role}.title`)}</span>
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => openCamera(i)}><RotateCcw className="h-4 w-4 mr-1" />{t(`${K}.retakeThis`)}</Button>
                      <Button size="sm" variant="ghost" onClick={() => removeShot(i)}>{t(`${K}.remove`)}</Button>
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
                  <div className="grid grid-cols-2 gap-2">
                    <Button className="h-12" onClick={() => openCamera()}>
                      <Camera className="h-5 w-5 mr-2" />{shots.length === 0 ? t('cropGrowth.takePhoto') : t(`${K}.takeNext`)}
                    </Button>
                    <Button className="h-12" variant="outline" onClick={() => { replaceRef.current = undefined; galleryInput.current?.click(); }}>
                      <Images className="h-5 w-5 mr-2" />{t(`${K}.addFromGallery`)}
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
