import i18n from '@/i18n/config';

/**
 * Text for an error raised by an account action (switch workspace, add role,
 * update account). The error code decides the text, through the identity
 * bundle, so nothing is shown in a language the person did not choose.
 */
export function accountErrorMessage(error: unknown): string {
  const raw = (error as { code?: unknown } | null | undefined)?.code;
  const code = typeof raw === 'string' ? raw : '';
  const key = `identity.errors.${code}`;
  return code && i18n.exists(key) ? i18n.t(key) : i18n.t('identity.errors.generic');
}
