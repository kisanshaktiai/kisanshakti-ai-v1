import { useState, useEffect, useMemo } from 'react';
import type { ElementType, ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useAuthStore } from '@/stores/authStore';
import { useLanguageStore } from '@/stores/languageStore';
import { useLands } from '@/hooks/useLands';
import { farmerAuthService } from '@/services/farmerAuthService';
import { useToast } from '@/hooks/use-toast';
import { Check, Droplets, LandPlot, Landmark, Loader2, MapPin, Package, SlidersHorizontal, Tractor, User } from 'lucide-react';
import { AvatarUpload } from '@/components/profile/AvatarUpload';
import { InnerPageHeader } from '@/components/profile/InnerPageHeader';
import { IconTile, sectionCardClass } from '@/components/profile/SettingsList';
import { PageShell } from '@/components/layout/PageShell';
import { cn } from '@/lib/utils';

// One look for every control on this form: 48px tall, 16px text (no zoom on focus).
const inputClass = 'h-12 rounded-xl text-base md:text-base';
const selectClass = 'h-12 rounded-xl text-base';
const textareaClass = 'rounded-xl text-base';

interface FieldProps {
  id: string;
  label: string;
  hint?: string;
  className?: string;
  children: ReactNode;
}

function Field({ id, label, hint, className, children }: FieldProps) {
  return (
    <div className={cn('space-y-2', className)}>
      <Label htmlFor={id} className="text-sm font-semibold leading-snug text-foreground">{label}</Label>
      {children}
      {hint && <p className="text-xs leading-snug text-muted-foreground">{hint}</p>}
    </div>
  );
}

interface ToggleRowProps {
  id: string;
  icon: ElementType;
  label: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}

/** A yes/no question as one large row: the whole row switches it. */
function ToggleRow({ id, icon, label, checked, onCheckedChange }: ToggleRowProps) {
  return (
    <label
      htmlFor={id}
      className="flex min-h-[56px] cursor-pointer items-center gap-3 rounded-xl border border-border bg-background px-3 py-2"
    >
      <IconTile icon={icon} size="sm" tone={checked ? 'primary' : 'muted'} />
      <span className="min-w-0 flex-1 text-base font-medium leading-snug text-foreground">{label}</span>
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} />
    </label>
  );
}

interface FormSectionProps {
  value: string;
  icon: ElementType;
  title: string;
  /** What is filled in already, shown under the title while the section is closed. */
  summary?: string;
  children: ReactNode;
}

function FormSection({ value, icon, title, summary, children }: FormSectionProps) {
  return (
    <AccordionItem value={value} className={cn(sectionCardClass, 'overflow-hidden')}>
      <AccordionTrigger className="min-h-[64px] min-w-0 gap-3 px-4 py-3 text-left hover:no-underline [&>svg]:h-5 [&>svg]:w-5 [&>svg]:text-muted-foreground">
        <span className="flex min-w-0 flex-1 items-center gap-3">
          <IconTile icon={icon} />
          <span className="min-w-0 flex-1">
            <span className="block text-base font-bold leading-snug text-foreground">{title}</span>
            {summary && <span className="mt-0.5 block truncate text-sm font-normal leading-snug text-muted-foreground">{summary}</span>}
          </span>
        </span>
      </AccordionTrigger>
      <AccordionContent className="px-4 pb-4 pt-1">
        <div className="grid gap-4 sm:grid-cols-2">{children}</div>
      </AccordionContent>
    </AccordionItem>
  );
}

export default function ProfileEdit() {
  const { t } = useTranslation();
  const availableLanguages = useLanguageStore((s) => s.availableLanguages);
  // Total land is the sum of the lands the farmer has drawn, not a typed number.
  const { lands } = useLands();
  const landsTotalAcres = useMemo(() => Math.round(lands.reduce((sum, land) => sum + (Number(land.area_acres) || 0), 0) * 100) / 100, [lands]);
  const navigate = useNavigate();
  const { user, setUser } = useAuthStore();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [dataLoading, setDataLoading] = useState(true);
  const [avatarUrl, setAvatarUrl] = useState(user?.avatarUrl || '');

  // Initialize form with user data
  const [formData, setFormData] = useState({
    // Personal Info
    fullName: user?.fullName || '',
    displayName: user?.displayName || '',
    dateOfBirth: user?.dateOfBirth || '',
    gender: user?.gender || '',
    email: '',
    bio: '',
    aadhaarNumber: '',
    preferredContactMethod: 'phone',
    
    // Address
    addressLine1: '',
    addressLine2: '',
    village: user?.village || '',
    taluka: user?.taluka || '',
    district: user?.district || '',
    state: user?.state || '',
    pincode: user?.pincode || '',
    
    // Farm Details
    totalLandAcres: user?.totalLandAcres || 0,
    primaryCrops: user?.primaryCrops?.join(', ') || '',
    farmingExperienceYears: user?.farmingExperienceYears || 0,
    farmType: user?.farmType || '',
    hasLoan: false,
    loanAmount: 0,
    
    // Facilities
    hasTractor: user?.hasTractor || false,
    hasIrrigation: user?.hasIrrigation || false,
    irrigationType: user?.irrigationType || '',
    hasStorage: user?.hasStorage || false,
    
    // Other
    annualIncomeRange: user?.annualIncomeRange || '',
    preferredLanguage: user?.preferredLanguage || 'hi',
    notes: ''
  });

  // Read through the verified-session service; locked-down browser table grants
  // are not a profile API and cannot authorize a farmer write.
  useEffect(() => {
    const loadProfileData = async () => {
      if (!user?.id) return;

      setDataLoading(true);
      try {
        const { farmer: farmerData, profile: profileData } = await farmerAuthService.getFarmerProfile();
        const mergedData = {
          fullName: profileData?.full_name || farmerData?.farmer_name || user.fullName || '',
          displayName: profileData?.display_name || user.displayName || '',
          dateOfBirth: profileData?.date_of_birth || user.dateOfBirth || '',
          gender: profileData?.gender || user.gender || '',
          email: profileData?.email || '',
          bio: profileData?.bio || '',
          aadhaarNumber: profileData?.aadhaar_number || farmerData?.aadhaar_number || '',
          preferredContactMethod: farmerData?.preferred_contact_method || 'phone',
          addressLine1: profileData?.address_line1 || '',
          addressLine2: profileData?.address_line2 || '',
          village: profileData?.village || user.village || '',
          taluka: profileData?.taluka || user.taluka || '',
          district: profileData?.district || user.district || '',
          state: profileData?.state || user.state || '',
          pincode: profileData?.pincode || user.pincode || '',
          totalLandAcres: profileData?.total_land_acres ?? farmerData?.total_land_acres ?? user.totalLandAcres ?? 0,
          primaryCrops: (profileData?.primary_crops || farmerData?.primary_crops || user.primaryCrops || []).join(', '),
          farmingExperienceYears: profileData?.farming_experience_years ?? farmerData?.farming_experience_years ?? user.farmingExperienceYears ?? 0,
          farmType: farmerData?.farm_type || user.farmType || '',
          hasLoan: farmerData?.has_loan ?? false,
          loanAmount: farmerData?.loan_amount ?? 0,
          hasTractor: profileData?.has_tractor ?? farmerData?.has_tractor ?? user.hasTractor ?? false,
          hasIrrigation: profileData?.has_irrigation ?? farmerData?.has_irrigation ?? user.hasIrrigation ?? false,
          irrigationType: farmerData?.irrigation_type || user.irrigationType || '',
          hasStorage: profileData?.has_storage ?? farmerData?.has_storage ?? user.hasStorage ?? false,
          annualIncomeRange: profileData?.annual_income_range || farmerData?.annual_income_range || user.annualIncomeRange || '',
          preferredLanguage: profileData?.preferred_language || farmerData?.language_preference || user.preferredLanguage || 'hi',
          notes: farmerData?.notes || ''
        };

        setFormData(mergedData);
        if (profileData?.avatar_url) setAvatarUrl(profileData.avatar_url);
      } catch (error) {
        console.error('Error loading profile:', error);
        toast({
          title: t('common.error'),
          description: t('profile_edit.loadFailed'),
          variant: 'destructive'
        });
      } finally {
        setDataLoading(false);
      }
    };

    loadProfileData();
  }, [user, t, toast]);

  const handleAvatarUpdate = (url: string) => {
    setAvatarUrl(url);
    if (user) {
      setUser({ ...user, avatarUrl: url });
    }
  };

  const handleInputChange = (field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleSave = async () => {
    if (!user || !user.tenantId) return;

    setLoading(true);
    try {
      const cropsArray = formData.primaryCrops
        .split(',')
        .map(crop => crop.trim())
        .filter(crop => crop.length > 0);

      const saved = await farmerAuthService.updateFarmerProfile({
        fullName: formData.fullName,
        displayName: formData.displayName,
        dateOfBirth: formData.dateOfBirth,
        gender: formData.gender,
        email: formData.email,
        bio: formData.bio,
        aadhaarNumber: formData.aadhaarNumber,
        preferredContactMethod: formData.preferredContactMethod,
        addressLine1: formData.addressLine1,
        addressLine2: formData.addressLine2,
        village: formData.village,
        taluka: formData.taluka,
        district: formData.district,
        state: formData.state,
        pincode: formData.pincode,
        totalLandAcres: lands.length > 0 ? landsTotalAcres : formData.totalLandAcres,
        primaryCrops: cropsArray,
        farmingExperienceYears: formData.farmingExperienceYears,
        farmType: formData.farmType,
        hasLoan: formData.hasLoan,
        loanAmount: formData.loanAmount,
        hasTractor: formData.hasTractor,
        hasIrrigation: formData.hasIrrigation,
        irrigationType: formData.irrigationType,
        hasStorage: formData.hasStorage,
        annualIncomeRange: formData.annualIncomeRange,
        preferredLanguage: formData.preferredLanguage,
        notes: formData.notes,
      });

      setUser({
        ...user,
        name: formData.fullName || user.name,
        farmerName: formData.fullName || user.farmerName,
        fullName: formData.fullName,
        displayName: formData.displayName,
        dateOfBirth: formData.dateOfBirth,
        gender: formData.gender,
        village: formData.village,
        taluka: formData.taluka,
        district: formData.district,
        state: formData.state,
        pincode: formData.pincode,
        totalLandAcres: lands.length > 0 ? landsTotalAcres : formData.totalLandAcres,
        primaryCrops: cropsArray,
        farmingExperienceYears: formData.farmingExperienceYears,
        farmType: formData.farmType,
        hasTractor: formData.hasTractor,
        hasIrrigation: formData.hasIrrigation,
        irrigationType: formData.irrigationType,
        hasStorage: formData.hasStorage,
        annualIncomeRange: formData.annualIncomeRange,
        preferredLanguage: formData.preferredLanguage
      });

      // Keep offline sign-in's cached profile aligned with the saved server copy.
      try {
        const { offlineAuthService } = await import('@/services/offlineAuthService');
        await offlineAuthService.updateCachedFarmer(saved.farmer, saved.profile);
      } catch { /* no offline copy on this device */ }

      toast({
        title: t('common.success'),
        description: t('profile_edit.updateSuccess'),
      });
      navigate('/app/profile');
    } catch (error) {
      console.error('Error saving profile:', error);
      toast({
        title: t('common.error'),
        description: t('profile_edit.updateFailed'),
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const goBack = () => navigate('/app/profile');

  // What each closed section already holds, so the farmer sees it without opening it.
  const languageName = availableLanguages.find((lang) => lang.code === formData.preferredLanguage)?.nativeName;
  const shownLandAcres = lands.length > 0 ? landsTotalAcres : formData.totalLandAcres;
  const sectionSummary = {
    personal: formData.fullName || formData.displayName,
    address: [formData.village, formData.district].filter(Boolean).join(', '),
    farm: [`${shownLandAcres} ${t('common.acres')}`, formData.primaryCrops].filter(Boolean).join(' · '),
    facilities: [
      formData.hasTractor && t('profile.farm_info.tractor'),
      formData.hasIrrigation && t('profile.farm_info.irrigation'),
      formData.hasStorage && t('profile.farm_info.storage'),
    ].filter(Boolean).join(', '),
    preferences: languageName,
  };

  const saveLabel = loading ? t('profile_edit.saving') : t('profile_edit.save');
  const saveIcon = loading
    ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
    : <Check className="h-4 w-4" aria-hidden="true" />;

  return (
    <PageShell
      padding="none"
      spacing="none"
      stickyHeader={
        <InnerPageHeader
          title={t('profile_edit.title')}
          onBack={goBack}
          action={
            // Save stays in view while the farmer scrolls or types.
            <Button
              onClick={handleSave}
              disabled={loading || dataLoading}
              className="h-11 shrink-0 px-4 text-sm font-semibold"
            >
              {saveIcon}
              {saveLabel}
            </Button>
          }
        />
      }
    >
      <div className="mx-auto w-full max-w-2xl space-y-3 px-4 py-4">
        {dataLoading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : (
          <>
            {/* Profile Picture Section */}
            <div className={cn(sectionCardClass, 'flex items-center gap-4 p-4')}>
              <AvatarUpload 
                currentAvatarUrl={avatarUrl}
                onAvatarUpdate={handleAvatarUpdate}
                size="lg"
                editable={true}
              />
              <div className="min-w-0 flex-1">
                <p className="break-words text-base font-bold leading-snug text-foreground">{user?.fullName || user?.name}</p>
                <p className="mt-1 text-sm leading-snug text-muted-foreground">{t('profile_edit.changePhotoHint')}</p>
              </div>
            </div>

            <Accordion type="multiple" defaultValue={['personal']} className="space-y-3">
              {/* Personal Information */}
              <FormSection value="personal" icon={User} title={t('profile_edit.personalInfo')} summary={sectionSummary.personal}>
                <Field id="fullName" label={t('profile_edit.fullName')}>
                  <Input
                    id="fullName"
                    value={formData.fullName}
                    onChange={(e) => handleInputChange('fullName', e.target.value)}
                    placeholder={t('profile_edit.fullNamePlaceholder')}
                    autoComplete="name"
                    className={inputClass}
                  />
                </Field>
                
                <Field id="displayName" label={t('profile_edit.displayName')}>
                  <Input
                    id="displayName"
                    value={formData.displayName}
                    onChange={(e) => handleInputChange('displayName', e.target.value)}
                    placeholder={t('profile_edit.displayNamePlaceholder')}
                    className={inputClass}
                  />
                </Field>

                <Field id="dateOfBirth" label={t('profile_edit.dateOfBirth')}>
                  <Input
                    id="dateOfBirth"
                    type="date"
                    value={formData.dateOfBirth}
                    onChange={(e) => handleInputChange('dateOfBirth', e.target.value)}
                    className={inputClass}
                  />
                </Field>

                <Field id="gender" label={t('profile_edit.gender')}>
                  <Select
                    value={formData.gender}
                    onValueChange={(value) => handleInputChange('gender', value)}
                  >
                    <SelectTrigger id="gender" className={selectClass}>
                      <SelectValue placeholder={t('profile_edit.genderPlaceholder')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Male">{t('profile_edit.male')}</SelectItem>
                      <SelectItem value="Female">{t('profile_edit.female')}</SelectItem>
                      <SelectItem value="Other">{t('profile_edit.other')}</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>

                <Field id="email" label={t('profile_edit.emailOptional')}>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => handleInputChange('email', e.target.value)}
                    placeholder={t('profile_edit.emailOptionalPlaceholder')}
                    autoComplete="email"
                    className={inputClass}
                  />
                </Field>

                <Field id="aadhaarNumber" label={t('profile_edit.aadhaar')}>
                  <Input
                    id="aadhaarNumber"
                    value={formData.aadhaarNumber}
                    onChange={(e) => handleInputChange('aadhaarNumber', e.target.value)}
                    placeholder={t('profile_edit.aadhaarPlaceholder')}
                    maxLength={12}
                    inputMode="numeric"
                    className={inputClass}
                  />
                </Field>

                <Field id="bio" label={t('profile_edit.bio')} className="sm:col-span-2">
                  <Textarea
                    id="bio"
                    value={formData.bio}
                    onChange={(e) => handleInputChange('bio', e.target.value)}
                    placeholder={t('profile_edit.bioPlaceholder')}
                    rows={3}
                    className={textareaClass}
                  />
                </Field>
              </FormSection>

              {/* Address Information */}
              <FormSection value="address" icon={MapPin} title={t('profile_edit.address')} summary={sectionSummary.address}>
                <Field id="addressLine1" label={t('profile_edit.addressLine1')} className="sm:col-span-2">
                  <Input
                    id="addressLine1"
                    value={formData.addressLine1}
                    onChange={(e) => handleInputChange('addressLine1', e.target.value)}
                    placeholder={t('profile_edit.addressLine1Placeholder')}
                    className={inputClass}
                  />
                </Field>

                <Field id="addressLine2" label={t('profile_edit.addressLine2')} className="sm:col-span-2">
                  <Input
                    id="addressLine2"
                    value={formData.addressLine2}
                    onChange={(e) => handleInputChange('addressLine2', e.target.value)}
                    placeholder={t('profile_edit.addressLine2Placeholder')}
                    className={inputClass}
                  />
                </Field>

                <Field id="village" label={t('profile_edit.village')}>
                  <Input
                    id="village"
                    value={formData.village}
                    onChange={(e) => handleInputChange('village', e.target.value)}
                    placeholder={t('profile_edit.villagePlaceholder')}
                    className={inputClass}
                  />
                </Field>

                <Field id="taluka" label={t('profile_edit.taluka')}>
                  <Input
                    id="taluka"
                    value={formData.taluka}
                    onChange={(e) => handleInputChange('taluka', e.target.value)}
                    placeholder={t('profile_edit.talukaPlaceholder')}
                    className={inputClass}
                  />
                </Field>

                <Field id="district" label={t('profile_edit.district')}>
                  <Input
                    id="district"
                    value={formData.district}
                    onChange={(e) => handleInputChange('district', e.target.value)}
                    placeholder={t('profile_edit.districtPlaceholder')}
                    className={inputClass}
                  />
                </Field>

                <Field id="state" label={t('profile_edit.state')}>
                  <Input
                    id="state"
                    value={formData.state}
                    onChange={(e) => handleInputChange('state', e.target.value)}
                    placeholder={t('profile_edit.stateInputPlaceholder')}
                    className={inputClass}
                  />
                </Field>

                <Field id="pincode" label={t('profile_edit.pincode')}>
                  <Input
                    id="pincode"
                    value={formData.pincode}
                    onChange={(e) => handleInputChange('pincode', e.target.value)}
                    placeholder={t('profile_edit.pincodePlaceholder')}
                    maxLength={6}
                    inputMode="numeric"
                    autoComplete="postal-code"
                    className={inputClass}
                  />
                </Field>
              </FormSection>

              {/* Farm Details */}
              <FormSection value="farm" icon={LandPlot} title={t('profile_edit.farmDetails')} summary={sectionSummary.farm}>
                {lands.length > 0 ? (
                  <Field
                    id="totalLand"
                    label={t('profile_edit.totalLandAcres')}
                    hint={t('profile_edit.totalLandFromLands', { count: lands.length })}
                  >
                    <div id="totalLand" className="flex h-12 items-center rounded-xl border border-input bg-muted/40 px-3 text-base font-semibold text-foreground">
                      {landsTotalAcres}
                    </div>
                  </Field>
                ) : (
                  <Field
                    id="totalLand"
                    label={t('profile_edit.totalLandAcres')}
                    hint={t('profile_edit.totalLandAddLandsHint')}
                  >
                    <Input
                      id="totalLand"
                      type="number"
                      value={formData.totalLandAcres}
                      onChange={(e) => handleInputChange('totalLandAcres', parseFloat(e.target.value) || 0)}
                      placeholder={t('profile_edit.totalLandAcresPlaceholder')}
                      min="0"
                      step="0.1"
                      inputMode="decimal"
                      className={inputClass}
                    />
                  </Field>
                )}

                <Field id="experience" label={t('profile_edit.farmingExperienceYears')}>
                  <Input
                    id="experience"
                    type="number"
                    value={formData.farmingExperienceYears}
                    onChange={(e) => handleInputChange('farmingExperienceYears', parseInt(e.target.value) || 0)}
                    placeholder={t('profile_edit.farmingExperiencePlaceholder')}
                    min="0"
                    inputMode="numeric"
                    className={inputClass}
                  />
                </Field>

                <Field id="crops" label={t('profile_edit.primaryCrops')} className="sm:col-span-2">
                  <Textarea
                    id="crops"
                    value={formData.primaryCrops}
                    onChange={(e) => handleInputChange('primaryCrops', e.target.value)}
                    placeholder={t('profile_edit.primaryCropsPlaceholder')}
                    rows={2}
                    className={textareaClass}
                  />
                </Field>

                <Field id="farmType" label={t('profile_edit.farmType')}>
                  <Select
                    value={formData.farmType}
                    onValueChange={(value) => handleInputChange('farmType', value)}
                  >
                    <SelectTrigger id="farmType" className={selectClass}>
                      <SelectValue placeholder={t('profile_edit.farmTypePlaceholder')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Small">{t('profile_edit.farmTypeSmall')}</SelectItem>
                      <SelectItem value="Medium">{t('profile_edit.farmTypeMedium')}</SelectItem>
                      <SelectItem value="Large">{t('profile_edit.farmTypeLarge')}</SelectItem>
                      <SelectItem value="Commercial">{t('profile_edit.farmTypeCommercial')}</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>

                <Field id="income" label={t('profile_edit.annualIncome')}>
                  <Select
                    value={formData.annualIncomeRange}
                    onValueChange={(value) => handleInputChange('annualIncomeRange', value)}
                  >
                    <SelectTrigger id="income" className={selectClass}>
                      <SelectValue placeholder={t('profile_edit.annualIncomePlaceholder')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="< 1 Lakh">{t('profile_edit.incomeBelow1')}</SelectItem>
                      <SelectItem value="1-3 Lakhs">{t('profile_edit.income1to3')}</SelectItem>
                      <SelectItem value="3-5 Lakhs">{t('profile_edit.income3to5')}</SelectItem>
                      <SelectItem value="5-10 Lakhs">{t('profile_edit.income5to10')}</SelectItem>
                      <SelectItem value="> 10 Lakhs">{t('profile_edit.incomeAbove10')}</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>

                <div className="sm:col-span-2">
                  <ToggleRow
                    id="hasLoan"
                    icon={Landmark}
                    label={t('profile_edit.hasLoan')}
                    checked={formData.hasLoan}
                    onCheckedChange={(checked) => handleInputChange('hasLoan', checked)}
                  />
                </div>

                {formData.hasLoan && (
                  <Field id="loanAmount" label={t('profile_edit.loanAmount')} className="sm:col-span-2">
                    <Input
                      id="loanAmount"
                      type="number"
                      value={formData.loanAmount}
                      onChange={(e) => handleInputChange('loanAmount', parseFloat(e.target.value) || 0)}
                      placeholder={t('profile_edit.loanAmountPlaceholder')}
                      min="0"
                      inputMode="numeric"
                      className={inputClass}
                    />
                  </Field>
                )}
              </FormSection>

              {/* Facilities */}
              <FormSection value="facilities" icon={Tractor} title={t('profile_edit.facilities')} summary={sectionSummary.facilities}>
                <div className="space-y-3 sm:col-span-2">
                  <ToggleRow
                    id="tractor"
                    icon={Tractor}
                    label={t('profile_edit.hasTractor')}
                    checked={formData.hasTractor}
                    onCheckedChange={(checked) => handleInputChange('hasTractor', checked)}
                  />

                  <ToggleRow
                    id="irrigation"
                    icon={Droplets}
                    label={t('profile_edit.hasIrrigation')}
                    checked={formData.hasIrrigation}
                    onCheckedChange={(checked) => handleInputChange('hasIrrigation', checked)}
                  />

                  {formData.hasIrrigation && (
                    <Field id="irrigationType" label={t('profile_edit.irrigationType')}>
                      <Select
                        value={formData.irrigationType}
                        onValueChange={(value) => handleInputChange('irrigationType', value)}
                      >
                        <SelectTrigger id="irrigationType" className={selectClass}>
                          <SelectValue placeholder={t('profile_edit.irrigationTypePlaceholder')} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Drip">{t('profile_edit.drip')}</SelectItem>
                          <SelectItem value="Sprinkler">{t('profile_edit.sprinkler')}</SelectItem>
                          <SelectItem value="Canal">{t('profile_edit.canal')}</SelectItem>
                          <SelectItem value="Tubewell">{t('profile_edit.tubewell')}</SelectItem>
                          <SelectItem value="Rainfed">{t('profile_edit.rainfed')}</SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                  )}

                  <ToggleRow
                    id="storage"
                    icon={Package}
                    label={t('profile_edit.hasStorage')}
                    checked={formData.hasStorage}
                    onCheckedChange={(checked) => handleInputChange('hasStorage', checked)}
                  />
                </div>
              </FormSection>

              {/* Preferences */}
              <FormSection value="preferences" icon={SlidersHorizontal} title={t('profile_edit.preferencesNotes')} summary={sectionSummary.preferences}>
                <Field id="language" label={t('profile_edit.language')}>
                  <Select
                    value={formData.preferredLanguage}
                    onValueChange={(value) => handleInputChange('preferredLanguage', value)}
                  >
                    <SelectTrigger id="language" className={selectClass}>
                      <SelectValue placeholder={t('profile_edit.languagePlaceholder')} />
                    </SelectTrigger>
                    <SelectContent>
                      {availableLanguages.map((lang) => (
                        <SelectItem key={lang.code} value={lang.code}>{lang.nativeName}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>

                <Field id="contactMethod" label={t('profile_edit.contactMethod')}>
                  <Select
                    value={formData.preferredContactMethod}
                    onValueChange={(value) => handleInputChange('preferredContactMethod', value)}
                  >
                    <SelectTrigger id="contactMethod" className={selectClass}>
                      <SelectValue placeholder={t('profile_edit.contactMethodPlaceholder')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="phone">{t('profile_edit.contactPhone')}</SelectItem>
                      <SelectItem value="sms">{t('profile_edit.contactSms')}</SelectItem>
                      <SelectItem value="whatsapp">{t('profile_edit.contactWhatsapp')}</SelectItem>
                      <SelectItem value="email">{t('profile_edit.contactEmail')}</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>

                <Field id="notes" label={t('profile_edit.notes')} className="sm:col-span-2">
                  <Textarea
                    id="notes"
                    value={formData.notes}
                    onChange={(e) => handleInputChange('notes', e.target.value)}
                    placeholder={t('profile_edit.notesPlaceholder')}
                    rows={3}
                    className={textareaClass}
                  />
                </Field>
              </FormSection>
            </Accordion>

            {/* Actions at the end of the form (Save is also in the header). */}
            <div className="flex gap-3 pt-2">
              <Button
                onClick={goBack}
                variant="outline"
                className="h-12 flex-1 text-base"
                disabled={loading}
              >
                {t('profile_edit.cancel')}
              </Button>
              
              <Button
                onClick={handleSave}
                className="h-12 flex-1 text-base"
                disabled={loading}
              >
                {saveIcon}
                {saveLabel}
              </Button>
            </div>
          </>
        )}
      </div>
    </PageShell>
  );
}
