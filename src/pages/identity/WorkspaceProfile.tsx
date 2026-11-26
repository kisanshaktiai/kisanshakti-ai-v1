import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronRight, Loader2, LogOut, Pencil, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { PageShell } from '@/components/layout/PageShell';
import { useAccountStore } from '@/stores/accountStore';
import { useLanguageStore } from '@/stores/languageStore';
import { useOfflineStatus } from '@/hooks/useOfflineStatus';
import { accountSessionService } from '@/services/accountSessionService';
import { isMultiRoleEnabled } from '@/services/farmerAuthService';
import { accountErrorMessage } from '@/lib/accountErrors';
import { ROUTE_ROLES } from '@/lib/accountRoles';

const NAME_MAX = 80; // same bound as the server (updateAccount)

/**
 * Profile tab of the Provider and Customer workspaces: display name, masked
 * mobile number, language (name and language editable), the way to the Roles
 * page, and logout.
 */
export default function WorkspaceProfile() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const isOnline = useOfflineStatus();
  const account = useAccountStore((s) => s.account);
  const { currentLanguage, availableLanguages, setLanguage } = useLanguageStore();

  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [language, setLanguageChoice] = useState(currentLanguage);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);

  const languageName =
    availableLanguages.find((l) => l.code === currentLanguage)?.nativeName ?? currentLanguage;

  const openEditor = () => {
    setName(account?.displayName ?? '');
    setLanguageChoice(currentLanguage);
    setError(null);
    setEditing(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setSaving(true);
    setError(null);
    try {
      await accountSessionService.updateAccount({ displayName: trimmed, languageCode: language });
      if (language !== currentLanguage) setLanguage(language);
      setEditing(false);
    } catch (err) {
      setError(accountErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = async () => {
    setLoggingOut(true);
    await accountSessionService.logout();
    navigate('/auth', { replace: true });
  };

  const rows = [
    { label: t('identity.profile.name'), value: account?.displayName ?? '' },
    { label: t('identity.profile.mobile'), value: account?.mobileMasked ?? '' },
    { label: t('identity.profile.language'), value: languageName },
  ];

  return (
    <PageShell variant="gradient-soft">
      <h1 className="text-2xl font-bold text-foreground">{t('nav.profile')}</h1>

      <Card className="divide-y divide-border">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center justify-between gap-3 px-4 py-4">
            <span className="text-sm text-muted-foreground">{row.label}</span>
            <span className="text-base font-semibold text-foreground text-right break-words">{row.value}</span>
          </div>
        ))}
        <div className="p-3">
          <Button variant="outline" className="w-full h-12 text-base" onClick={openEditor} disabled={!isOnline}>
            <Pencil className="w-4 h-4 mr-2" aria-hidden="true" />
            {t('identity.profile.edit')}
          </Button>
        </div>
      </Card>

      {isMultiRoleEnabled() && (
        <button
          type="button"
          onClick={() => navigate(ROUTE_ROLES)}
          className="w-full min-h-[64px] flex items-center gap-3 rounded-2xl border border-border bg-card p-4 text-left"
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/15 text-primary">
            <Users className="h-5 w-5" aria-hidden="true" />
          </span>
          <span className="flex-1 min-w-0">
            <span className="block text-base font-semibold text-foreground">{t('identity.rolesPage.title')}</span>
            <span className="block text-sm text-muted-foreground">{t('identity.profile.rolesHint')}</span>
          </span>
          <ChevronRight className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
        </button>
      )}

      <Button variant="outline" className="w-full h-12 text-base" onClick={handleLogout} disabled={loggingOut}>
        {loggingOut ? (
          <Loader2 className="w-4 h-4 animate-spin mr-2" aria-hidden="true" />
        ) : (
          <LogOut className="w-4 h-4 mr-2" aria-hidden="true" />
        )}
        {t('auth.logout')}
      </Button>

      <Sheet open={editing} onOpenChange={setEditing}>
        <SheetContent side="bottom" className="rounded-t-3xl pb-safe max-h-[92vh] overflow-y-auto">
          <SheetHeader className="text-left mb-4">
            <SheetTitle>{t('identity.profile.edit')}</SheetTitle>
          </SheetHeader>
          <form onSubmit={handleSave} className="space-y-5">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <div className="space-y-2">
              <label htmlFor="profile-display-name" className="text-sm font-semibold text-foreground">
                {t('identity.onboarding.nameLabel')}
              </label>
              <Input
                id="profile-display-name"
                value={name}
                onChange={(e) => setName(e.target.value.slice(0, NAME_MAX))}
                maxLength={NAME_MAX}
                autoComplete="name"
                className="h-14 text-lg rounded-2xl"
                disabled={saving}
                required
              />
              <p className="text-xs text-muted-foreground">{t('identity.onboarding.profileDescription')}</p>
            </div>
            <div className="space-y-2">
              <label htmlFor="profile-language" className="text-sm font-semibold text-foreground">
                {t('identity.onboarding.languageLabel')}
              </label>
              <select
                id="profile-language"
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
            <Button type="submit" disabled={!name.trim() || saving} className="w-full h-12 text-base">
              {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" aria-hidden="true" />}
              {t('identity.profile.save')}
            </Button>
          </form>
        </SheetContent>
      </Sheet>
    </PageShell>
  );
}
