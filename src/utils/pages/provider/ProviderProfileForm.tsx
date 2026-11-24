import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ChoiceChips, Field, INPUT_CLASS, ProviderPage, SaveError } from '@/components/provider/ProviderUi';
import { useAccountStore } from '@/stores/accountStore';
import { useLanguageStore } from '@/stores/languageStore';
import { useProviderWorkspace } from '@/hooks/useProviderWorkspace';
import { providerWorkspaceService } from '@/services/providerWorkspaceService';
import { PROVIDER_ROUTES } from '@/lib/providerRoutes';
import { catalogueLabel, numberOrNull } from '@/lib/providerText';

// Same bounds as the table (20261124140100_provider_workspace_tables.sql).
const NAME_MAX = 80;
const ABOUT_MAX = 600;
const EXPERIENCE_MAX = 80;

/**
 * Business profile: who the provider is, the name farmers will see, years of
 * experience, a short note and the languages spoken. Verification, rating and
 * listing status are set by the platform and have no field here.
 */
export default function ProviderProfileForm() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const account = useAccountStore((s) => s.account);
  const { currentLanguage, availableLanguages } = useLanguageStore();
  const { workspace, catalogue, loading, loadError, isOnline, saving, saveError, run, reload } = useProviderWorkspace();

  const [providerType, setProviderType] = useState('');
  const [name, setName] = useState('');
  const [experience, setExperience] = useState('');
  const [about, setAbout] = useState('');
  const [languages, setLanguages] = useState<string[]>([]);
  const [filled, setFilled] = useState(false);

  // Fill the form once, from the saved profile or with what is already known.
  useEffect(() => {
    if (filled || !workspace) return;
    const profile = workspace.profile;
    setProviderType(profile?.provider_type ?? '');
    setName(profile?.public_name ?? account?.displayName ?? '');
    setExperience(profile?.experience_years != null ? String(profile.experience_years) : '');
    setAbout(profile?.about_text ?? '');
    setLanguages(profile?.languages_spoken?.length ? profile.languages_spoken : [currentLanguage]);
    setFilled(true);
  }, [filled, workspace, account, currentLanguage]);

  const years = numberOrNull(experience);
  const yearsValid = years == null || (Number.isInteger(years) && years >= 0 && years <= EXPERIENCE_MAX);
  const canSave = !!providerType && !!name.trim() && yearsValid && !saving && isOnline;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSave) return;
    const ok = await run(() => providerWorkspaceService.saveProfile({
      provider_type: providerType,
      public_name: name.trim(),
      experience_years: years,
      about_text: about.trim() || null,
      about_language: about.trim() ? currentLanguage : null,
      languages_spoken: languages,
    }));
    if (ok) navigate(PROVIDER_ROUTES.business);
  };

  return (
    <ProviderPage
      title={t('provider.profile.title')}
      backTo={PROVIDER_ROUTES.business}
      pending={(loading && !workspace) || !catalogue}
      loadError={loadError}
      onRetry={reload}
      isOnline={isOnline}
    >
      {catalogue && (
        <form onSubmit={handleSave} className="space-y-5">
          <SaveError message={saveError} />

          <Field label={t('provider.profile.typeLabel')}>
            <ChoiceChips
              label={t('provider.profile.typeLabel')}
              options={catalogue.providerTypes.map((p) => ({
                value: p.code, label: catalogueLabel('providerType', p.code, p.label_en),
              }))}
              selected={providerType ? [providerType] : []}
              onToggle={setProviderType}
              disabled={saving}
            />
          </Field>

          <Field label={t('provider.profile.nameLabel')} htmlFor="provider-name" hint={t('provider.profile.nameHint')}>
            <Input
              id="provider-name"
              value={name}
              onChange={(e) => setName(e.target.value.slice(0, NAME_MAX))}
              maxLength={NAME_MAX}
              className={INPUT_CLASS}
              disabled={saving}
              required
            />
          </Field>

          <Field
            label={t('provider.profile.experienceLabel')}
            htmlFor="provider-experience"
            hint={yearsValid ? undefined : t('provider.profile.experienceInvalid', { max: EXPERIENCE_MAX })}
          >
            <Input
              id="provider-experience"
              type="number"
              inputMode="numeric"
              min={0}
              max={EXPERIENCE_MAX}
              value={experience}
              onChange={(e) => setExperience(e.target.value)}
              className={INPUT_CLASS}
              disabled={saving}
            />
          </Field>

          <Field
            label={t('provider.profile.aboutLabel')}
            htmlFor="provider-about"
            hint={t('provider.common.charsLeft', { count: ABOUT_MAX - about.length })}
          >
            <Textarea
              id="provider-about"
              value={about}
              onChange={(e) => setAbout(e.target.value.slice(0, ABOUT_MAX))}
              maxLength={ABOUT_MAX}
              rows={4}
              className="text-lg rounded-2xl"
              disabled={saving}
            />
          </Field>

          <Field label={t('provider.profile.languagesLabel')}>
            <ChoiceChips
              label={t('provider.profile.languagesLabel')}
              options={availableLanguages.map((l) => ({ value: l.code, label: l.nativeName }))}
              selected={languages}
              onToggle={(code) =>
                setLanguages((current) => (current.includes(code) ? current.filter((c) => c !== code) : [...current, code]))
              }
              disabled={saving}
            />
          </Field>

          <Button type="submit" disabled={!canSave} className="w-full h-12 text-base">
            {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" aria-hidden="true" />}
            {t('provider.common.save')}
          </Button>
        </form>
      )}
    </ProviderPage>
  );
}
