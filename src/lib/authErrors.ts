import i18n from '@/i18n/config';

/**
 * Text for an error raised while signing in, registering, or setting or
 * resetting a PIN. The server answers with a code ({ error: "<code>" } in
 * _shared/farmer-auth-core.ts) and the code decides the text: first through
 * the auth bundle (auth.errors.<code>), then through the identity bundle, for
 * the account codes a PIN login can also return. A code without a text, and an
 * error without a code (a thrown TypeError, a timeout), read as the generic
 * sentence. A code or a technical message is never put on the screen, and
 * nothing is shown in a language the person did not choose.
 */
const CODE_SHAPE = /^[a-z0-9_]+$/i;

/** The code an error carries, or '' when it carries none. */
export function authErrorCode(error: unknown): string {
  const raw = (error as { code?: unknown } | null | undefined)?.code;
  return typeof raw === 'string' && CODE_SHAPE.test(raw) ? raw : '';
}

/** The sentence for a code, in the app language. */
export function authMessageForCode(code: string): string {
  if (code && CODE_SHAPE.test(code)) {
    for (const key of [`auth.errors.${code}`, `identity.errors.${code}`]) {
      if (i18n.exists(key)) return i18n.t(key);
    }
  }
  return i18n.t('auth.errors.generic');
}

/** The sentence for a caught error, in the app language. */
export function authErrorMessage(error: unknown): string {
  return authMessageForCode(authErrorCode(error));
}
