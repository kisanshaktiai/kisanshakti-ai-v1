import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { ArrowLeft, Save, Loader2 } from 'lucide-react';
import { AvatarUpload } from '@/components/profile/AvatarUpload';
import { PageShell } from '@/components/layout/PageShell';

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

  return (
    <PageShell padding="default" spacing="none">
      {/* pb-28: room for the pinned save bar above the bottom navigation */}
      <div className="space-y-4 pb-28">
        {dataLoading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 sticky top-0 bg-background/95 backdrop-blur-sm z-10 -mx-4 px-4 py-3 border-b">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigate('/app/profile')}
                className="shrink-0"
                aria-label={t('common.back')}
              >
                <ArrowLeft className="w-5 h-5" />
              </Button>
              <h1 className="text-xl font-bold text-foreground truncate">{t('profile_edit.title')}</h1>
            </div>

            {/* Profile Picture Section */}
            <Card>
              <CardContent className="pt-6 flex flex-col items-center gap-4">
                <AvatarUpload 
                  currentAvatarUrl={avatarUrl}
                  onAvatarUpdate={handleAvatarUpdate}
                  size="xl"
                  editable={true}
                />
                <div className="text-center">
                  <p className="text-sm font-medium">{user?.fullName || user?.name}</p>
                  <p className="text-xs text-muted-foreground">{t('profile_edit.changePhotoHint')}</p>
                </div>
              </CardContent>
            </Card>

            {/* Personal Information */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t('profile_edit.personalInfo')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="fullName">{t('profile_edit.fullName')}</Label>
                  <Input
                    id="fullName"
                    value={formData.fullName}
                    onChange={(e) => handleInputChange('fullName', e.target.value)}
                    placeholder={t('profile_edit.fullNamePlaceholder')}
                  />
                </div>
                
                <div>
                  <Label htmlFor="displayName">{t('profile_edit.displayName')}</Label>
                  <Input
                    id="displayName"
                    value={formData.displayName}
                    onChange={(e) => handleInputChange('displayName', e.target.value)}
                    placeholder={t('profile_edit.displayNamePlaceholder')}
                  />
                </div>

                <div>
                  <Label htmlFor="dateOfBirth">{t('profile_edit.dateOfBirth')}</Label>
                  <Input
                    id="dateOfBirth"
                    type="date"
                    value={formData.dateOfBirth}
                    onChange={(e) => handleInputChange('dateOfBirth', e.target.value)}
                  />
                </div>

                <div>
                  <Label htmlFor="gender">{t('profile_edit.gender')}</Label>
                  <Select
                    value={formData.gender}
                    onValueChange={(value) => handleInputChange('gender', value)}
                  >
                    <SelectTrigger id="gender">
                      <SelectValue placeholder={t('profile_edit.genderPlaceholder')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Male">{t('profile_edit.male')}</SelectItem>
                      <SelectItem value="Female">{t('profile_edit.female')}</SelectItem>
                      <SelectItem value="Other">{t('profile_edit.other')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="email">{t('profile_edit.emailOptional')}</Label>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => handleInputChange('email', e.target.value)}
                    placeholder={t('profile_edit.emailOptionalPlaceholder')}
                  />
                </div>

                <div>
                  <Label htmlFor="aadhaarNumber">{t('profile_edit.aadhaar')}</Label>
                  <Input
                    id="aadhaarNumber"
                    value={formData.aadhaarNumber}
                    onChange={(e) => handleInputChange('aadhaarNumber', e.target.value)}
                    placeholder={t('profile_edit.aadhaarPlaceholder')}
                    maxLength={12}
                  />
                </div>

                <div>
                  <Label htmlFor="bio">{t('profile_edit.bio')}</Label>
                  <Textarea
                    id="bio"
                    value={formData.bio}
                    onChange={(e) => handleInputChange('bio', e.target.value)}
                    placeholder={t('profile_edit.bioPlaceholder')}
                    rows={3}
                  />
                </div>
              </CardContent>
            </Card>

      {/* Address Information */}
            <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('profile_edit.address')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="addressLine1">{t('profile_edit.addressLine1')}</Label>
            <Input
              id="addressLine1"
              value={formData.addressLine1}
              onChange={(e) => handleInputChange('addressLine1', e.target.value)}
              placeholder={t('profile_edit.addressLine1Placeholder')}
            />
          </div>

          <div>
            <Label htmlFor="addressLine2">{t('profile_edit.addressLine2')}</Label>
            <Input
              id="addressLine2"
              value={formData.addressLine2}
              onChange={(e) => handleInputChange('addressLine2', e.target.value)}
              placeholder={t('profile_edit.addressLine2Placeholder')}
            />
          </div>

          <div>
            <Label htmlFor="village">{t('profile_edit.village')}</Label>
            <Input
              id="village"
              value={formData.village}
              onChange={(e) => handleInputChange('village', e.target.value)}
              placeholder={t('profile_edit.villagePlaceholder')}
            />
          </div>

          <div>
            <Label htmlFor="taluka">{t('profile_edit.taluka')}</Label>
            <Input
              id="taluka"
              value={formData.taluka}
              onChange={(e) => handleInputChange('taluka', e.target.value)}
              placeholder={t('profile_edit.talukaPlaceholder')}
            />
          </div>

          <div>
            <Label htmlFor="district">{t('profile_edit.district')}</Label>
            <Input
              id="district"
              value={formData.district}
              onChange={(e) => handleInputChange('district', e.target.value)}
              placeholder={t('profile_edit.districtPlaceholder')}
            />
          </div>

          <div>
            <Label htmlFor="state">{t('profile_edit.state')}</Label>
            <Input
              id="state"
              value={formData.state}
              onChange={(e) => handleInputChange('state', e.target.value)}
              placeholder={t('profile_edit.stateInputPlaceholder')}
            />
          </div>

          <div>
            <Label htmlFor="pincode">{t('profile_edit.pincode')}</Label>
            <Input
              id="pincode"
              value={formData.pincode}
              onChange={(e) => handleInputChange('pincode', e.target.value)}
              placeholder={t('profile_edit.pincodePlaceholder')}
              maxLength={6}
            />
          </div>
        </CardContent>
      </Card>

      {/* Farm Details */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('profile_edit.farmDetails')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="totalLand">{t('profile_edit.totalLandAcres')}</Label>
            {lands.length > 0 ? (
              <>
                <div id="totalLand" className="flex h-11 items-center rounded-md border border-input bg-muted/40 px-3 text-base font-semibold text-foreground">
                  {landsTotalAcres}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{t('profile_edit.totalLandFromLands', { count: lands.length })}</p>
              </>
            ) : (
              <>
                <Input
                  id="totalLand"
                  type="number"
                  value={formData.totalLandAcres}
                  onChange={(e) => handleInputChange('totalLandAcres', parseFloat(e.target.value) || 0)}
                  placeholder={t('profile_edit.totalLandAcresPlaceholder')}
                  min="0"
                  step="0.1"
                />
                <p className="mt-1 text-xs text-muted-foreground">{t('profile_edit.totalLandAddLandsHint')}</p>
              </>
            )}
          </div>

          <div>
            <Label htmlFor="crops">{t('profile_edit.primaryCrops')}</Label>
            <Textarea
              id="crops"
              value={formData.primaryCrops}
              onChange={(e) => handleInputChange('primaryCrops', e.target.value)}
              placeholder={t('profile_edit.primaryCropsPlaceholder')}
              rows={2}
            />
          </div>

          <div>
            <Label htmlFor="experience">{t('profile_edit.farmingExperienceYears')}</Label>
            <Input
              id="experience"
              type="number"
              value={formData.farmingExperienceYears}
              onChange={(e) => handleInputChange('farmingExperienceYears', parseInt(e.target.value) || 0)}
              placeholder={t('profile_edit.farmingExperiencePlaceholder')}
              min="0"
            />
          </div>

          <div>
            <Label htmlFor="farmType">{t('profile_edit.farmType')}</Label>
            <Select
              value={formData.farmType}
              onValueChange={(value) => handleInputChange('farmType', value)}
            >
              <SelectTrigger id="farmType">
                <SelectValue placeholder={t('profile_edit.farmTypePlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Small">{t('profile_edit.farmTypeSmall')}</SelectItem>
                <SelectItem value="Medium">{t('profile_edit.farmTypeMedium')}</SelectItem>
                <SelectItem value="Large">{t('profile_edit.farmTypeLarge')}</SelectItem>
                <SelectItem value="Commercial">{t('profile_edit.farmTypeCommercial')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="income">{t('profile_edit.annualIncome')}</Label>
            <Select
              value={formData.annualIncomeRange}
              onValueChange={(value) => handleInputChange('annualIncomeRange', value)}
            >
              <SelectTrigger id="income">
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
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="hasLoan">{t('profile_edit.hasLoan')}</Label>
            <Switch
              id="hasLoan"
              checked={formData.hasLoan}
              onCheckedChange={(checked) => handleInputChange('hasLoan', checked)}
            />
          </div>

          {formData.hasLoan && (
            <div>
              <Label htmlFor="loanAmount">{t('profile_edit.loanAmount')}</Label>
              <Input
                id="loanAmount"
                type="number"
                value={formData.loanAmount}
                onChange={(e) => handleInputChange('loanAmount', parseFloat(e.target.value) || 0)}
                placeholder={t('profile_edit.loanAmountPlaceholder')}
                min="0"
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Facilities */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('profile_edit.facilities')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <Label htmlFor="tractor">{t('profile_edit.hasTractor')}</Label>
            <Switch
              id="tractor"
              checked={formData.hasTractor}
              onCheckedChange={(checked) => handleInputChange('hasTractor', checked)}
            />
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="irrigation">{t('profile_edit.hasIrrigation')}</Label>
            <Switch
              id="irrigation"
              checked={formData.hasIrrigation}
              onCheckedChange={(checked) => handleInputChange('hasIrrigation', checked)}
            />
          </div>

          {formData.hasIrrigation && (
            <div>
              <Label htmlFor="irrigationType">{t('profile_edit.irrigationType')}</Label>
              <Select
                value={formData.irrigationType}
                onValueChange={(value) => handleInputChange('irrigationType', value)}
              >
                <SelectTrigger id="irrigationType">
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
            </div>
          )}

          <div className="flex items-center justify-between">
            <Label htmlFor="storage">{t('profile_edit.hasStorage')}</Label>
            <Switch
              id="storage"
              checked={formData.hasStorage}
              onCheckedChange={(checked) => handleInputChange('hasStorage', checked)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Preferences */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('profile_edit.preferencesNotes')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="language">{t('profile_edit.language')}</Label>
            <Select
              value={formData.preferredLanguage}
              onValueChange={(value) => handleInputChange('preferredLanguage', value)}
            >
              <SelectTrigger id="language">
                <SelectValue placeholder={t('profile_edit.languagePlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                {availableLanguages.map((lang) => (
                  <SelectItem key={lang.code} value={lang.code}>{lang.nativeName}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="contactMethod">{t('profile_edit.contactMethod')}</Label>
            <Select
              value={formData.preferredContactMethod}
              onValueChange={(value) => handleInputChange('preferredContactMethod', value)}
            >
              <SelectTrigger id="contactMethod">
                <SelectValue placeholder={t('profile_edit.contactMethodPlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="phone">{t('profile_edit.contactPhone')}</SelectItem>
                <SelectItem value="sms">{t('profile_edit.contactSms')}</SelectItem>
                <SelectItem value="whatsapp">{t('profile_edit.contactWhatsapp')}</SelectItem>
                <SelectItem value="email">{t('profile_edit.contactEmail')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="notes">{t('profile_edit.notes')}</Label>
            <Textarea
              id="notes"
              value={formData.notes}
              onChange={(e) => handleInputChange('notes', e.target.value)}
              placeholder={t('profile_edit.notesPlaceholder')}
              rows={3}
            />
          </div>
        </CardContent>
      </Card>

            {/* Fixed Bottom Action Bar */}
            {/* Save bar: pinned just above the bottom navigation (5rem + the phone's own safe area), so it never sits under it. */}
            <div className="fixed left-0 right-0 p-4 bg-background/95 backdrop-blur-sm border-t z-10" style={{ bottom: 'calc(5rem + env(safe-area-inset-bottom, 0px))' }}>
              <div className="max-w-2xl mx-auto flex gap-3">
                <Button
                  onClick={() => navigate('/app/profile')}
                  variant="outline"
                  className="flex-1"
                  disabled={loading}
                >
                  {t('profile_edit.cancel')}
                </Button>
                
                <Button
                  onClick={handleSave}
                  className="flex-1"
                  disabled={loading}
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      {t('profile_edit.saving')}
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4 mr-2" />
                      {t('profile_edit.save')}
                    </>
                  )}
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </PageShell>
  );
}
