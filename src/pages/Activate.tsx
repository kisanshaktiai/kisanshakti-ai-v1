/**
 * ACTIVATE — where a registered farmer redeems an activation code.
 * CHANGE LOG
 * 2026-11-25 — Created (farmer activation, app part).
 *
 * ProtectedRoute sends a farmer here while the server says a code is still
 * needed (farmer.activation_required). The farmer types the code or scans its
 * QR; farmerAuthService.activate() sends it to the server, which alone decides
 * whether it is valid and which tenant the farmer joins. Nothing on this page
 * unlocks anything: until a code is redeemed the database refuses this
 * farmer's session for every farmer table and function.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { Camera, CheckCircle2, KeyRound, Loader2, LogOut, QrCode, WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useAuthStore } from '@/stores/authStore';
import { useAccountStore } from '@/stores/accountStore';
import { activeRolesOf } from '@/lib/accountRoles';
import { useOfflineStatus } from '@/hooks/useOfflineStatus';
import { hasActivationText, useActivationText } from '@/hooks/useActivationText';
import { getSessionToken } from '@/integrations/supabase/client';
import {
  farmerAuthService, FarmerAuthError, type ActivationResult,
} from '@/services/farmerAuthService';
import { accountSessionService } from '@/services/accountSessionService';
import {
  cleanActivationInput, formatActivationCode, isCompleteActivationCode, parseActivationQr,
} from '@/lib/activationCode';
import { createQrReader, type QrReader } from '@/lib/qrReader';
import { canUseLiveCamera } from '@/components/Photo/LiveCameraViewfinder';
import ActivationQrScanner from '@/components/activation/ActivationQrScanner';
import { WorkspaceSwitcher } from '@/components/identity/WorkspaceSwitcher';

const APP_HOME = '/app';

export default function Activate() {
  const tr = useActivationText();
  const { i18n } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isOnline = useOfflineStatus();
  const mobile = useAuthStore((s) => s.user?.phone ?? s.session?.mobile ?? '');
  const hasFarmer = useAuthStore((s) => !!s.user?.id);
  // A person who also holds another role can go back to that workspace from here.
  const holdsOtherRole = useAccountStore((s) => activeRolesOf(s.account).length > 1);

  const [symbols, setSymbols] = useState('');
  const [checking, setChecking] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<ActivationResult | null>(null);
  const [reader, setReader] = useState<QrReader | null>(null);
  const [scanning, setScanning] = useState(false);
  const [cameraFailed, setCameraFailed] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);

  // No session on this device: there is nobody to activate.
  useEffect(() => {
    if (!hasFarmer || !getSessionToken()) navigate('/auth', { replace: true });
  }, [hasFarmer, navigate]);

  // The server's answer decides whether this screen is needed at all (the
  // farmer may have activated on another phone, or codes may no longer be
  // required). Offline, the screen stays and says so.
  useEffect(() => {
    if (!hasFarmer || !getSessionToken()) return;
    let cancelled = false;
    (async () => {
      try {
        const status = await farmerAuthService.activationStatus();
        if (!cancelled && status?.required === false) navigate(APP_HOME, { replace: true });
      } catch (err) {
        if (!cancelled && err instanceof FarmerAuthError && err.code === 'session_required') {
          await accountSessionService.logout();
          navigate('/auth', { replace: true });
        }
      } finally {
        if (!cancelled) setChecking(false);
      }
    })();
    return () => { cancelled = true; };
  }, [hasFarmer, navigate]);

  useEffect(() => {
    let cancelled = false;
    createQrReader().then((qr) => { if (!cancelled) setReader(() => qr); });
    return () => { cancelled = true; };
  }, []);

  const messageFor = useCallback((err: unknown): string => {
    if (err instanceof FarmerAuthError) {
      if (err.code === 'rate_limited') {
        return tr('errors.rate_limited', { minutes: Math.max(1, Math.ceil((err.retryAfterSeconds ?? 60) / 60)) });
      }
      if (hasActivationText(`errors.${err.code}`)) return tr(`errors.${err.code}`);
    }
    return tr('errors.generic');
  }, [tr]);

  const submit = useCallback(async (code: string) => {
    if (submitting) return;
    setError(null);
    if (!isOnline) return;   // the offline notice is already on the screen
    setSubmitting(true);
    try {
      const result = await farmerAuthService.activate(code);
      // The farmer now belongs to the tenant of the code: re-open the farmer
      // state with it, and drop anything cached under the old tenant.
      await accountSessionService.applyActivation(result);
      queryClient.clear();
      setDone(result);
    } catch (err) {
      if (err instanceof FarmerAuthError && err.code === 'activation_not_enabled') {
        // Codes are no longer required: nothing to redeem, the app is open.
        await farmerAuthService.activationStatus().catch(() => undefined);
        navigate(APP_HOME, { replace: true });
        return;
      }
      if (err instanceof FarmerAuthError && err.code === 'session_required') {
        await accountSessionService.logout();
        navigate('/auth', { replace: true });
        return;
      }
      setError(messageFor(err));
    } finally {
      setSubmitting(false);
    }
  }, [submitting, isOnline, queryClient, navigate, messageFor]);

  const handleScanned = (scanned: string) => {
    setScanning(false);
    setSymbols(scanned);
    submit(scanned);
  };

  const handlePhoto = async (file: File | undefined) => {
    if (!file || !reader) return;
    setError(null);
    try {
      const picture = await createImageBitmap(file);
      const texts = await reader(picture);
      picture.close?.();
      const scanned = texts.map(parseActivationQr).find((value): value is string => !!value);
      if (scanned) handleScanned(scanned);
      else setError(tr('scanner.photoNotRead'));
    } catch {
      setError(tr('scanner.photoNotRead'));
    }
  };

  const handleSignOut = async () => {
    await accountSessionService.logout();
    navigate('/auth', { replace: true });
  };

  // ── Activated ────────────────────────────────────────────────────────────
  if (done) {
    const tenantName = done.tenant?.name?.trim();
    const validUntil = done.subscriptionEnd ? new Date(done.subscriptionEnd) : null;
    return (
      <div className="min-h-mobile-screen bg-gradient-to-br from-primary/10 via-background to-accent/10 flex flex-col items-center justify-center p-4">
        <Card className="w-full max-w-md p-6 space-y-6 shadow-xl text-center">
          <div className="w-20 h-20 mx-auto bg-primary/10 rounded-full flex items-center justify-center animate-fade-in">
            <CheckCircle2 className="w-10 h-10 text-primary" aria-hidden="true" />
          </div>
          <div className="space-y-2" role="status" aria-live="polite">
            <h1 className="text-2xl font-bold text-foreground">{tr('success.title')}</h1>
            <p className="text-base text-muted-foreground">
              {tenantName ? tr('success.withTenant', { tenant: tenantName }) : tr('success.generic')}
            </p>
            {validUntil && !Number.isNaN(validUntil.getTime()) && (
              <p className="text-sm text-muted-foreground">
                {tr('success.validUntil', {
                  date: validUntil.toLocaleDateString(i18n.language, { day: 'numeric', month: 'long', year: 'numeric' }),
                })}
              </p>
            )}
          </div>
          <Button className="w-full h-12 text-base" onClick={() => navigate(APP_HOME, { replace: true })}>
            {tr('success.continue')}
          </Button>
        </Card>
      </div>
    );
  }

  // ── Enter or scan the code ───────────────────────────────────────────────
  const liveCamera = !!reader && canUseLiveCamera() && !cameraFailed;
  const busy = submitting || checking;

  return (
    <div className="min-h-mobile-screen bg-gradient-to-br from-primary/10 via-background to-accent/10 flex flex-col items-center justify-center p-4">
      <Card className="w-full max-w-md p-6 space-y-6 shadow-xl">
        {holdsOtherRole && (
          <div className="flex justify-end">
            <WorkspaceSwitcher variant="header" />
          </div>
        )}

        <div className="text-center space-y-3">
          <div className="w-20 h-20 mx-auto bg-primary/10 rounded-full flex items-center justify-center animate-fade-in">
            <KeyRound className="w-10 h-10 text-primary" aria-hidden="true" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">{tr('title')}</h1>
          <p className="text-sm text-muted-foreground">{tr('description')}</p>
          {mobile && <p className="text-xs text-muted-foreground">{tr('mobile', { mobile })}</p>}
        </div>

        {!isOnline && (
          <Alert>
            <WifiOff className="h-4 w-4" aria-hidden="true" />
            <AlertDescription>{tr('offline')}</AlertDescription>
          </Alert>
        )}

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {reader && (
          <div className="space-y-3">
            {liveCamera ? (
              <Button
                type="button"
                className="w-full h-14 text-base"
                disabled={busy}
                onClick={() => { setError(null); setScanning(true); }}
              >
                <QrCode className="mr-2 h-6 w-6" aria-hidden="true" />
                {tr('scan')}
              </Button>
            ) : (
              <Button
                type="button"
                className="w-full h-14 text-base"
                disabled={busy}
                onClick={() => photoInputRef.current?.click()}
              >
                <Camera className="mr-2 h-6 w-6" aria-hidden="true" />
                {tr('scanPhoto')}
              </Button>
            )}
            <input
              ref={photoInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                handlePhoto(file);
              }}
            />
            <div className="flex items-center gap-3" aria-hidden="true">
              <span className="h-px flex-1 bg-border" />
              <span className="text-xs text-muted-foreground">{tr('or')}</span>
              <span className="h-px flex-1 bg-border" />
            </div>
          </div>
        )}

        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (isCompleteActivationCode(symbols)) submit(symbols);
          }}
        >
          <div className="space-y-2">
            <label htmlFor="activation-code" className="text-sm font-medium text-foreground">
              {tr('codeLabel')}
            </label>
            <Input
              id="activation-code"
              value={formatActivationCode(symbols)}
              onChange={(event) => { setError(null); setSymbols(cleanActivationInput(event.target.value)); }}
              placeholder="XXXX-XXXX-XXXX"
              inputMode="text"
              autoCapitalize="characters"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              maxLength={24}
              disabled={submitting}
              aria-describedby="activation-code-hint"
              className="h-14 text-center font-mono text-xl tracking-widest uppercase"
            />
            <p id="activation-code-hint" className="text-xs text-muted-foreground">{tr('codeHint')}</p>
          </div>

          <Button
            type="submit"
            variant={reader ? 'outline' : 'default'}
            className="w-full h-12 text-base"
            disabled={!isCompleteActivationCode(symbols) || busy}
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin mr-2" aria-hidden="true" />
                {tr('submitting')}
              </>
            ) : checking ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin mr-2" aria-hidden="true" />
                {tr('checking')}
              </>
            ) : (
              tr('submit')
            )}
          </Button>
        </form>

        <div className="space-y-3 text-center">
          <p className="text-xs text-muted-foreground">{tr('noCode')}</p>
          <Button type="button" variant="ghost" size="sm" onClick={handleSignOut} disabled={submitting}>
            <LogOut className="w-4 h-4 mr-2" aria-hidden="true" />
            {tr('signOut')}
          </Button>
        </div>
      </Card>

      {scanning && reader && (
        <ActivationQrScanner
          read={reader}
          onCode={handleScanned}
          onCancel={() => setScanning(false)}
          onUnavailable={() => {
            setScanning(false);
            setCameraFailed(true);
            setError(tr('scanner.cameraUnavailable'));
          }}
        />
      )}
    </div>
  );
}
