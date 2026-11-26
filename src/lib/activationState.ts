/**
 * activationState — remembers, on this device, that the signed-in farmer still
 * has to redeem an activation code.
 *
 * CHANGE LOG
 * 2026-11-25 — Created (farmer activation, app part).
 *
 * The server marks every farmer row it returns with `activation_required`
 * (true = no code redeemed yet, and codes are enforced). farmerAuthService
 * writes that answer here; ProtectedRoute reads it to open the Activate screen
 * without a network call. This only decides which screen opens: the database
 * refuses an unactivated farmer's session on its own, whatever is stored here.
 * The key is personal and is removed on sign-out (services/deviceWipe).
 */
export const ACTIVATION_REQUIRED_KEY = 'ks_activation_required';

export function isActivationRequired(): boolean {
  try { return localStorage.getItem(ACTIVATION_REQUIRED_KEY) === 'true'; } catch { return false; }
}

export function rememberActivation(required: unknown): void {
  try {
    if (required === true) localStorage.setItem(ACTIVATION_REQUIRED_KEY, 'true');
    else localStorage.removeItem(ACTIVATION_REQUIRED_KEY);
  } catch { /* storage unavailable */ }
}
