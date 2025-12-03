import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { RefreshCw, Download, CheckCircle, XCircle, AlertCircle, Smartphone } from 'lucide-react';

interface DebugState {
  platform: string;
  browser: string;
  isStandalone: boolean;
  isSecureContext: boolean;
  hasServiceWorker: boolean;
  serviceWorkerState: string | null;
  manifestValid: boolean;
  promptCaptured: boolean;
  promptCapturedAt: string | null;
  promptUsed: boolean;
  userAgent: string;
  errors: string[];
  warnings: string[];
}

export default function PWADebug() {
  const [state, setState] = useState<DebugState | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const runDiagnostics = async () => {
    setLoading(true);
    
    // Detect platform
    const ua = navigator.userAgent;
    let platform = 'unknown';
    let browser = 'unknown';
    
    if (/Android/i.test(ua)) platform = 'android';
    else if (/iPhone|iPad|iPod/i.test(ua)) platform = 'ios';
    else if (/Windows/i.test(ua)) platform = 'windows';
    else if (/Mac/i.test(ua)) platform = 'macos';
    
    if (/SamsungBrowser/i.test(ua)) browser = 'samsung';
    else if (/Chrome/i.test(ua) && !/Edg/i.test(ua)) browser = 'chrome';
    else if (/Firefox/i.test(ua)) browser = 'firefox';
    else if (/Safari/i.test(ua) && !/Chrome/i.test(ua)) browser = 'safari';
    else if (/Edg/i.test(ua)) browser = 'edge';
    
    // Check standalone
    const isStandalone = 
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true;
    
    // Check service worker
    let swState: string | null = null;
    let hasSW = 'serviceWorker' in navigator;
    
    if (hasSW) {
      try {
        const regs = await navigator.serviceWorker.getRegistrations();
        if (regs.length > 0) {
          swState = regs[0].active ? 'active' : 
                    regs[0].installing ? 'installing' :
                    regs[0].waiting ? 'waiting' : 'none';
        }
      } catch (e) {
        console.error('SW check error:', e);
      }
    }
    
    // Check manifest
    let manifestValid = false;
    const manifestLink = document.querySelector('link[rel="manifest"]') as HTMLLinkElement;
    const errors: string[] = [];
    const warnings: string[] = [];
    
    if (manifestLink) {
      try {
        const resp = await fetch(manifestLink.href);
        if (resp.ok) {
          const manifest = await resp.json();
          const requiredFields = ['name', 'short_name', 'start_url', 'display', 'icons'];
          const missing = requiredFields.filter(f => !manifest[f]);
          manifestValid = missing.length === 0;
          
          if (missing.length > 0) {
            errors.push(`Manifest missing: ${missing.join(', ')}`);
          }
          
          if (!manifest.id) {
            warnings.push('Manifest missing "id" field');
          }
          
          if (manifest.icons) {
            const has192 = manifest.icons.some((i: any) => i.sizes?.includes('192'));
            const has512 = manifest.icons.some((i: any) => i.sizes?.includes('512'));
            if (!has192) errors.push('Missing 192x192 icon');
            if (!has512) errors.push('Missing 512x512 icon');
          }
        } else {
          errors.push(`Manifest fetch failed: ${resp.status}`);
        }
      } catch (e) {
        errors.push(`Manifest error: ${e}`);
      }
    } else {
      errors.push('No manifest link found');
    }
    
    // Check prompt
    const promptCaptured = !!window.__capturedPwaPrompt || !!(window as any).deferredPwaPrompt;
    const promptCapturedAt = window.__pwaPromptCapturedAt 
      ? new Date(window.__pwaPromptCapturedAt).toISOString()
      : null;
    const promptUsed = !!window.__pwaPromptUsed;
    
    // Warnings
    if (isStandalone) {
      warnings.push('App already installed - beforeinstallprompt wont fire');
    }
    if (!window.isSecureContext) {
      errors.push('Not HTTPS - PWA install requires secure context');
    }
    if (!('onbeforeinstallprompt' in window)) {
      if (platform === 'ios') {
        warnings.push('iOS Safari: Use "Add to Home Screen" manually');
      } else {
        warnings.push('beforeinstallprompt not supported in this browser');
      }
    }
    if (!promptCaptured && !isStandalone && window.isSecureContext) {
      warnings.push('Prompt not captured - may need page refresh or meet install criteria');
    }
    
    const newState: DebugState = {
      platform,
      browser,
      isStandalone,
      isSecureContext: window.isSecureContext,
      hasServiceWorker: hasSW,
      serviceWorkerState: swState,
      manifestValid,
      promptCaptured,
      promptCapturedAt,
      promptUsed,
      userAgent: ua,
      errors,
      warnings,
    };
    
    setState(newState);
    setLogs(window.__PWA_DEBUG_LOGS__ || []);
    setLoading(false);
  };

  useEffect(() => {
    runDiagnostics();
  }, []);

  const handleInstall = async () => {
    const prompt = window.__capturedPwaPrompt || (window as any).deferredPwaPrompt;
    
    if (!prompt) {
      alert('No install prompt available. Check the diagnostics for details.');
      return;
    }
    
    try {
      prompt.prompt();
      const choice = await prompt.userChoice;
      alert(`Install result: ${choice.outcome}`);
      window.__pwaPromptUsed = true;
      runDiagnostics();
    } catch (e) {
      alert(`Install error: ${e}`);
    }
  };

  const StatusIcon = ({ ok }: { ok: boolean }) => 
    ok ? <CheckCircle className="h-4 w-4 text-green-500" /> : 
         <XCircle className="h-4 w-4 text-red-500" />;

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-2xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Smartphone className="h-6 w-6" />
            PWA Debug
          </h1>
          <Button onClick={runDiagnostics} disabled={loading} size="sm">
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        {state && (
          <>
            {/* Quick Status */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Quick Status</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="flex items-center gap-2">
                    <StatusIcon ok={state.isSecureContext} />
                    <span>HTTPS: {state.isSecureContext ? 'Yes' : 'No'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusIcon ok={state.serviceWorkerState === 'active'} />
                    <span>SW: {state.serviceWorkerState || 'None'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusIcon ok={state.manifestValid} />
                    <span>Manifest: {state.manifestValid ? 'Valid' : 'Invalid'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusIcon ok={state.promptCaptured} />
                    <span>Prompt: {state.promptCaptured ? 'Ready' : 'Not captured'}</span>
                  </div>
                </div>
                
                <div className="flex gap-2 pt-2">
                  <Badge variant={state.platform === 'android' ? 'default' : 'secondary'}>
                    {state.platform}
                  </Badge>
                  <Badge variant="outline">{state.browser}</Badge>
                  {state.isStandalone && <Badge variant="secondary">Installed</Badge>}
                </div>
              </CardContent>
            </Card>

            {/* Install Button */}
            <Card>
              <CardContent className="pt-4">
                <Button 
                  onClick={handleInstall} 
                  className="w-full" 
                  disabled={!state.promptCaptured || state.promptUsed}
                >
                  <Download className="h-4 w-4 mr-2" />
                  {state.promptUsed ? 'Prompt Already Used' :
                   state.promptCaptured ? 'Install App' : 
                   'Waiting for Install Prompt...'}
                </Button>
                {state.promptCapturedAt && (
                  <p className="text-xs text-muted-foreground mt-2 text-center">
                    Prompt captured: {state.promptCapturedAt}
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Errors & Warnings */}
            {(state.errors.length > 0 || state.warnings.length > 0) && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <AlertCircle className="h-5 w-5 text-yellow-500" />
                    Issues Found
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {state.errors.map((err, i) => (
                    <div key={i} className="flex items-start gap-2 text-sm text-red-600">
                      <XCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                      {err}
                    </div>
                  ))}
                  {state.warnings.map((warn, i) => (
                    <div key={i} className="flex items-start gap-2 text-sm text-yellow-600">
                      <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                      {warn}
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Logs */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Recent Logs</CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-48 w-full rounded border p-2">
                  <div className="space-y-1 font-mono text-xs">
                    {logs.length === 0 ? (
                      <p className="text-muted-foreground">No logs yet</p>
                    ) : (
                      logs.slice(-30).map((log, i) => (
                        <div key={i} className="whitespace-pre-wrap break-all">
                          {log}
                        </div>
                      ))
                    )}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>

            {/* User Agent */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">User Agent</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs font-mono break-all text-muted-foreground">
                  {state.userAgent}
                </p>
              </CardContent>
            </Card>
          </>
        )}

        <p className="text-xs text-center text-muted-foreground">
          Open browser console and run: <code>window.pwaDebug.runDiagnostics()</code>
        </p>
      </div>
    </div>
  );
}
