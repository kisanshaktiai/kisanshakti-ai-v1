import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ReachEditor } from '@/components/identity/ReachEditor';
import { useAccountStore } from '@/stores/accountStore';
import { useLanguageStore } from '@/stores/languageStore';
import { accountSessionService } from '@/services/accountSessionService';
import { accountErrorMessage } from '@/lib/accountErrors';
import { WORKSPACE_HOME, workspaceRoleOf } from '@/lib/accountRoles';

const NAME_MAX = 80; // same bound as the server (updateAccount)

/**
 * Short onboarding for a person who registered without the Farmer role:
 * display name and language, then Reach (base village + radius) of the
 * workspace being opened, then the workspace home. A second workspace sets its
 * own Reach from its Reach card. Reach can be left for later — the home shows it as not set.
 */
export default function AccountOnboarding() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const account = useAccountStore((s) => s.account);
  const { currentLanguage, availableLanguages, setLanguage } = useLanguageStore();

  const role = workspaceRoleOf(account);
  const [step, setStep] = useState<'profile' | 'reach'>(account?.displayName ? 'reach' : 'profile');
  const [name, setName] = useState(account?.displayName ?? '');
  const [language, setLanguageChoice] = useState(account?.languageCode || currentLanguage);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!account || !role || role === 'FARMER') return null; // WorkspaceRoute redirects

  const home = WORKSPACE_HOME[role];
  const trimmed = name.trim();

  const handleProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!trimmed) return;
    setSaving(true);
    setError(null);
    try {
      await accountSessionService.updateAccount({ displayName: trimmed, languageCode: language });
      if (language !== currentLanguage) setLanguage(language);
      setStep('reach');
    } catch (err) {
      setError(accountErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-mobile-screen bg-gradient-to-br from-primary/10 via-background to-accent/10 flex flex-col items-center justify-center p-4">
      <Card className="w-full max-w-md p-6 space-y-6 shadow-xl">
        <div className="text-center space-y-2">
          <p className="text-xs font-semibold text-primary">
            {t('identity.onboarding.step', { current: step === 'profile' ? 1 : 2, total: 2 })}
          </p>
          <h1 className="text-2xl font-bold text-foreground">
            {step === 'profile' ? t('identity.onboarding.profileTitle') : t('identity.onboarding.reachTitle')}
          </h1>
          <p className="text-sm text-muted-foreground">
            {step === 'profile'
              ? t('identity.onboarding.profileDescription')
              : t('identity.onboarding.reachDescription')}
          </p>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {step === 'profile' ? (
          <form onSubmit={handleProfile} className="space-y-5">
            <div className="space-y-2">
              <label htmlFor="account-display-name" className="text-sm font-semibold text-foreground">
                {t('identity.onboarding.nameLabel')}
              </label>
              <Input
                id="account-display-name"
                value={name}
                onChange={(e) => setName(e.target.value.slice(0, NAME_MAX))}
                maxLength={NAME_MAX}
                autoComplete="name"
                className="h-14 text-lg rounded-2xl"
                disabled={saving}
                required
              />
              <p className="text-xs text-muted-foreground">{t('identity.onboarding.nameHint')}</p>
            </div>

            <div className="space-y-2">
              <label htmlFor="account-language" className="text-sm font-semibold text-foreground">
                {t('identity.onboarding.languageLabel')}
              </label>
              <select
                id="account-language"
                value={language}
                onChange={(e) => setLanguageChoice(e.target.value)}
                disabled={saving}
                className="w-full h-14 rounded-2xl border-2 border-input bg-background px-4 text-lg text-foreground"
              >
                {availableLanguages.map((lang) => (
                  <option key={lang.code} value={lang.code}>{lang.nativeName}</option>
                ))}
              </select>
            </div>

            <Button type="submit" disabled={!trimmed || saving} className="w-full h-12 text-base">
              {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" aria-hidden="true" />}
              {t('auth.continue')}
            </Button>
          </form>
        ) : (
          <div className="space-y-4">
            <ReachEditor
              role={role}
              submitLabel={t('identity.onboarding.finish')}
              onSaved={() => navigate(home, { replace: true })}
            />
            <Button variant="link" className="w-full" onClick={() => navigate(home, { replace: true })}>
              {t('identity.onboarding.reachLater')}
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
