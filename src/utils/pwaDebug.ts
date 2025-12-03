/**
 * PWA Debug Utility - Comprehensive logging for PWA install debugging
 * This captures all PWA-related events and state for debugging Android install issues
 */

export interface PWADebugState {
  timestamp: string;
  platform: string;
  browser: string;
  isStandalone: boolean;
  isSecureContext: boolean;
  hasServiceWorker: boolean;
  serviceWorkerState: string | null;
  manifestUrl: string | null;
  manifestValid: boolean;
  beforeInstallPromptFired: boolean;
  promptCapturedAt: string | null;
  promptUsed: boolean;
  installOutcome: string | null;
  errors: string[];
  warnings: string[];
}

// Global debug state
let debugState: PWADebugState = {
  timestamp: new Date().toISOString(),
  platform: 'unknown',
  browser: 'unknown',
  isStandalone: false,
  isSecureContext: false,
  hasServiceWorker: false,
  serviceWorkerState: null,
  manifestUrl: null,
  manifestValid: false,
  beforeInstallPromptFired: false,
  promptCapturedAt: null,
  promptUsed: false,
  installOutcome: null,
  errors: [],
  warnings: [],
};

// Extend Window interface
declare global {
  interface Window {
    __PWA_DEBUG__?: PWADebugState;
    __PWA_DEBUG_LOGS__?: string[];
    pwaDebug?: typeof pwaDebug;
  }
}

/**
 * Log a PWA debug message with timestamp
 */
function log(level: 'info' | 'warn' | 'error', message: string, data?: any) {
  const timestamp = new Date().toISOString();
  const prefix = {
    info: '📱 [PWA-DEBUG]',
    warn: '⚠️ [PWA-DEBUG]',
    error: '❌ [PWA-DEBUG]',
  }[level];
  
  const logMessage = `${timestamp} ${prefix} ${message}`;
  
  // Store in global array for later retrieval
  if (!window.__PWA_DEBUG_LOGS__) {
    window.__PWA_DEBUG_LOGS__ = [];
  }
  window.__PWA_DEBUG_LOGS__.push(logMessage);
  
  // Keep only last 100 logs
  if (window.__PWA_DEBUG_LOGS__.length > 100) {
    window.__PWA_DEBUG_LOGS__.shift();
  }
  
  // Console output
  if (data) {
    console[level](logMessage, data);
  } else {
    console[level](logMessage);
  }
  
  // Track errors/warnings
  if (level === 'error') {
    debugState.errors.push(message);
  } else if (level === 'warn') {
    debugState.warnings.push(message);
  }
}

/**
 * Detect platform and browser
 */
function detectEnvironment() {
  const ua = navigator.userAgent;
  
  // Detect platform
  if (/Android/i.test(ua)) {
    debugState.platform = 'android';
  } else if (/iPhone|iPad|iPod/i.test(ua)) {
    debugState.platform = 'ios';
  } else if (/Windows/i.test(ua)) {
    debugState.platform = 'windows';
  } else if (/Mac/i.test(ua)) {
    debugState.platform = 'macos';
  } else if (/Linux/i.test(ua)) {
    debugState.platform = 'linux';
  }
  
  // Detect browser
  if (/SamsungBrowser/i.test(ua)) {
    debugState.browser = 'samsung-browser';
  } else if (/Chrome/i.test(ua) && !/Edg/i.test(ua)) {
    debugState.browser = 'chrome';
  } else if (/Firefox/i.test(ua)) {
    debugState.browser = 'firefox';
  } else if (/Safari/i.test(ua) && !/Chrome/i.test(ua)) {
    debugState.browser = 'safari';
  } else if (/Edg/i.test(ua)) {
    debugState.browser = 'edge';
  } else if (/Opera|OPR/i.test(ua)) {
    debugState.browser = 'opera';
  }
  
  log('info', `Environment: ${debugState.platform} / ${debugState.browser}`);
  log('info', `User Agent: ${ua}`);
}

/**
 * Check if app is running in standalone mode
 */
function checkStandaloneMode() {
  debugState.isStandalone = 
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as any).standalone === true ||
    document.referrer.includes('android-app://');
  
  log('info', `Standalone mode: ${debugState.isStandalone}`);
  
  if (debugState.isStandalone) {
    log('warn', 'App is already installed - beforeinstallprompt will NOT fire');
  }
}

/**
 * Check secure context
 */
function checkSecureContext() {
  debugState.isSecureContext = window.isSecureContext;
  
  if (!debugState.isSecureContext) {
    log('error', 'NOT in secure context (HTTPS required for PWA install)');
  } else {
    log('info', `Secure context: ${debugState.isSecureContext}`);
  }
}

/**
 * Check service worker status
 */
async function checkServiceWorker() {
  debugState.hasServiceWorker = 'serviceWorker' in navigator;
  
  if (!debugState.hasServiceWorker) {
    log('error', 'Service Worker not supported');
    return;
  }
  
  log('info', 'Service Worker supported: true');
  
  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    log('info', `Service Worker registrations: ${registrations.length}`);
    
    for (const reg of registrations) {
      const state = reg.active ? 'active' : 
                   reg.installing ? 'installing' : 
                   reg.waiting ? 'waiting' : 'none';
      
      log('info', `SW Registration: ${reg.scope}`, {
        state,
        scriptURL: reg.active?.scriptURL || reg.installing?.scriptURL || reg.waiting?.scriptURL,
      });
      
      debugState.serviceWorkerState = state;
    }
    
    if (registrations.length === 0) {
      log('warn', 'No Service Worker registered');
    }
  } catch (error) {
    log('error', `Service Worker check failed: ${error}`);
  }
}

/**
 * Check manifest status
 */
async function checkManifest() {
  const manifestLink = document.querySelector('link[rel="manifest"]') as HTMLLinkElement;
  
  if (!manifestLink) {
    log('error', 'No manifest link found in document');
    return;
  }
  
  debugState.manifestUrl = manifestLink.href;
  log('info', `Manifest URL: ${debugState.manifestUrl}`);
  
  try {
    const response = await fetch(manifestLink.href);
    
    if (!response.ok) {
      log('error', `Manifest fetch failed: ${response.status} ${response.statusText}`);
      return;
    }
    
    const manifest = await response.json();
    log('info', 'Manifest content:', manifest);
    
    // Validate required fields
    const requiredFields = ['name', 'short_name', 'start_url', 'display', 'icons'];
    const missingFields = requiredFields.filter(field => !manifest[field]);
    
    if (missingFields.length > 0) {
      log('error', `Manifest missing required fields: ${missingFields.join(', ')}`);
    } else {
      log('info', 'Manifest has all required fields');
    }
    
    // Check icons
    if (manifest.icons && Array.isArray(manifest.icons)) {
      log('info', `Manifest has ${manifest.icons.length} icons`);
      
      // Check for required 192x192 and 512x512 icons
      const has192 = manifest.icons.some((icon: any) => 
        icon.sizes?.includes('192x192') || icon.sizes === '192x192'
      );
      const has512 = manifest.icons.some((icon: any) => 
        icon.sizes?.includes('512x512') || icon.sizes === '512x512'
      );
      
      if (!has192) log('error', 'Missing 192x192 icon (required for Android)');
      if (!has512) log('error', 'Missing 512x512 icon (required for Android)');
      
      // Check icon accessibility
      for (const icon of manifest.icons) {
        try {
          const iconResponse = await fetch(icon.src);
          if (!iconResponse.ok) {
            log('error', `Icon not accessible: ${icon.src} (${iconResponse.status})`);
          } else {
            log('info', `Icon OK: ${icon.src}`);
          }
        } catch (e) {
          log('error', `Icon fetch error: ${icon.src}`);
        }
      }
    }
    
    // Check id field (required for Chrome 90+)
    if (!manifest.id) {
      log('warn', 'Manifest missing "id" field (recommended for Chrome 90+)');
    } else {
      log('info', `Manifest id: ${manifest.id}`);
    }
    
    // Check start_url
    log('info', `start_url: ${manifest.start_url}`);
    log('info', `display: ${manifest.display}`);
    log('info', `scope: ${manifest.scope || '/'}`);
    
    debugState.manifestValid = missingFields.length === 0;
    
  } catch (error) {
    log('error', `Manifest parse error: ${error}`);
  }
}

/**
 * Check beforeinstallprompt support
 */
function checkInstallPromptSupport() {
  const supported = 'onbeforeinstallprompt' in window;
  log('info', `beforeinstallprompt event supported: ${supported}`);
  
  if (!supported) {
    if (debugState.platform === 'ios') {
      log('warn', 'iOS Safari does not support beforeinstallprompt - use manual Add to Home Screen');
    } else if (debugState.browser === 'firefox') {
      log('warn', 'Firefox does not support beforeinstallprompt');
    } else if (debugState.browser === 'samsung-browser') {
      log('info', 'Samsung Browser may have limited PWA support');
    }
  }
  
  // Check if prompt was already captured
  if (window.__capturedPwaPrompt) {
    debugState.beforeInstallPromptFired = true;
    debugState.promptCapturedAt = window.__pwaPromptCapturedAt 
      ? new Date(window.__pwaPromptCapturedAt).toISOString()
      : 'unknown';
    log('info', `beforeinstallprompt already captured at: ${debugState.promptCapturedAt}`);
  } else {
    log('info', 'beforeinstallprompt not yet captured');
  }
  
  if (window.__pwaPromptUsed) {
    debugState.promptUsed = true;
    log('info', 'PWA prompt has been used');
  }
}

/**
 * Setup event listeners for PWA events
 */
function setupEventListeners() {
  // Listen for beforeinstallprompt
  window.addEventListener('beforeinstallprompt', (e) => {
    debugState.beforeInstallPromptFired = true;
    debugState.promptCapturedAt = new Date().toISOString();
    log('info', '🎯 beforeinstallprompt EVENT FIRED!');
    log('info', 'Event details:', {
      type: e.type,
      cancelable: e.cancelable,
      defaultPrevented: e.defaultPrevented,
    });
  });
  
  // Listen for appinstalled
  window.addEventListener('appinstalled', () => {
    debugState.installOutcome = 'installed';
    log('info', '🎉 appinstalled EVENT FIRED - App was installed!');
  });
  
  // Listen for custom events
  window.addEventListener('pwa-prompt-captured', () => {
    log('info', 'pwa-prompt-captured custom event received');
  });
  
  log('info', 'PWA event listeners registered');
}

/**
 * Get current debug state as formatted string
 */
function getDebugReport(): string {
  const state = { ...debugState, timestamp: new Date().toISOString() };
  
  let report = '\n========== PWA DEBUG REPORT ==========\n';
  report += `Timestamp: ${state.timestamp}\n`;
  report += `Platform: ${state.platform}\n`;
  report += `Browser: ${state.browser}\n`;
  report += `--------------------------------------\n`;
  report += `Is Standalone: ${state.isStandalone}\n`;
  report += `Is Secure Context: ${state.isSecureContext}\n`;
  report += `Has Service Worker: ${state.hasServiceWorker}\n`;
  report += `SW State: ${state.serviceWorkerState}\n`;
  report += `--------------------------------------\n`;
  report += `Manifest URL: ${state.manifestUrl}\n`;
  report += `Manifest Valid: ${state.manifestValid}\n`;
  report += `--------------------------------------\n`;
  report += `beforeinstallprompt Fired: ${state.beforeInstallPromptFired}\n`;
  report += `Prompt Captured At: ${state.promptCapturedAt}\n`;
  report += `Prompt Used: ${state.promptUsed}\n`;
  report += `Install Outcome: ${state.installOutcome}\n`;
  report += `--------------------------------------\n`;
  
  if (state.errors.length > 0) {
    report += `ERRORS (${state.errors.length}):\n`;
    state.errors.forEach((err, i) => {
      report += `  ${i + 1}. ${err}\n`;
    });
  }
  
  if (state.warnings.length > 0) {
    report += `WARNINGS (${state.warnings.length}):\n`;
    state.warnings.forEach((warn, i) => {
      report += `  ${i + 1}. ${warn}\n`;
    });
  }
  
  report += '======================================\n';
  
  return report;
}

/**
 * Main PWA debug object - exposed on window for console access
 */
export const pwaDebug = {
  /**
   * Run full diagnostic check
   */
  async runDiagnostics() {
    console.log('\n🔍 Running PWA Diagnostics...\n');
    
    debugState = {
      timestamp: new Date().toISOString(),
      platform: 'unknown',
      browser: 'unknown',
      isStandalone: false,
      isSecureContext: false,
      hasServiceWorker: false,
      serviceWorkerState: null,
      manifestUrl: null,
      manifestValid: false,
      beforeInstallPromptFired: false,
      promptCapturedAt: null,
      promptUsed: false,
      installOutcome: null,
      errors: [],
      warnings: [],
    };
    
    detectEnvironment();
    checkStandaloneMode();
    checkSecureContext();
    await checkServiceWorker();
    await checkManifest();
    checkInstallPromptSupport();
    
    // Update global state
    window.__PWA_DEBUG__ = debugState;
    
    console.log(getDebugReport());
    
    return debugState;
  },
  
  /**
   * Get current state
   */
  getState() {
    return debugState;
  },
  
  /**
   * Get all logs
   */
  getLogs() {
    return window.__PWA_DEBUG_LOGS__ || [];
  },
  
  /**
   * Print report
   */
  printReport() {
    console.log(getDebugReport());
  },
  
  /**
   * Check install prompt status
   */
  checkPrompt() {
    log('info', 'Checking install prompt status...');
    log('info', `window.__capturedPwaPrompt: ${!!window.__capturedPwaPrompt}`);
    log('info', `window.__pwaPromptCapturedAt: ${window.__pwaPromptCapturedAt}`);
    log('info', `window.__pwaPromptUsed: ${window.__pwaPromptUsed}`);
    
    if (window.__capturedPwaPrompt) {
      log('info', 'Prompt is available for use');
      return true;
    } else {
      log('warn', 'No prompt available');
      return false;
    }
  },
  
  /**
   * Manually trigger install (for testing)
   */
  async triggerInstall() {
    const prompt = window.__capturedPwaPrompt;
    
    if (!prompt) {
      log('error', 'Cannot trigger install - no prompt captured');
      return { success: false, error: 'No prompt available' };
    }
    
    try {
      log('info', 'Triggering install prompt...');
      prompt.prompt();
      
      const choice = await prompt.userChoice;
      log('info', `User choice: ${choice.outcome}`);
      
      debugState.installOutcome = choice.outcome;
      window.__pwaPromptUsed = true;
      
      return { success: true, outcome: choice.outcome };
    } catch (error) {
      log('error', `Install trigger failed: ${error}`);
      return { success: false, error: String(error) };
    }
  },
};

/**
 * Initialize PWA debugging
 */
export function initPwaDebug() {
  // Expose to window for console access
  window.pwaDebug = pwaDebug;
  window.__PWA_DEBUG__ = debugState;
  
  // Setup listeners
  setupEventListeners();
  
  // Initial checks
  detectEnvironment();
  checkStandaloneMode();
  checkSecureContext();
  checkInstallPromptSupport();
  
  log('info', '🔧 PWA Debug initialized - use window.pwaDebug.runDiagnostics() for full report');
  
  // Auto-run diagnostics after short delay
  setTimeout(async () => {
    await checkServiceWorker();
    await checkManifest();
    
    // Log summary
    console.log('\n📊 PWA Quick Status:');
    console.log(`   Platform: ${debugState.platform}`);
    console.log(`   Browser: ${debugState.browser}`);
    console.log(`   Standalone: ${debugState.isStandalone}`);
    console.log(`   Secure: ${debugState.isSecureContext}`);
    console.log(`   SW Active: ${debugState.serviceWorkerState === 'active'}`);
    console.log(`   Manifest Valid: ${debugState.manifestValid}`);
    console.log(`   Prompt Captured: ${debugState.beforeInstallPromptFired}`);
    
    if (debugState.errors.length > 0) {
      console.log(`\n   ⚠️ ${debugState.errors.length} errors found - run window.pwaDebug.printReport() for details`);
    }
  }, 2000);
}

export default pwaDebug;
