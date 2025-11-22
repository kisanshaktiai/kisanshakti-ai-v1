import { useState, useEffect } from 'react';
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
import { supabaseWithAuth } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, Save, Loader2 } from 'lucide-react';
import { AvatarUpload } from '@/components/profile/AvatarUpload';

export default function ProfileEdit() {
  const { t } = useTranslation();
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

  // Fetch fresh data from database on mount
  useEffect(() => {
    const loadProfileData = async () => {
      if (!user?.id || !user?.tenantId) return;
      
      setDataLoading(true);
      try {
        // Create authenticated client with custom headers
        const authClient = supabaseWithAuth(user.id, user.tenantId);
        console.log('🔐 Loading profile with authenticated client:', { userId: user.id, tenantId: user.tenantId });
        
        // Fetch from farmers table
        const { data: farmerData, error: farmerError } = await authClient
          .from('farmers')
          .select('*')
          .eq('id', user.id)
          .maybeSingle();

        if (farmerError) {
          console.error('Error loading farmer data:', farmerError);
        }

        // Fetch from user_profiles table
        const { data: profileData, error: profileError } = await authClient
          .from('user_profiles')
          .select('*')
          .eq('farmer_id', user.id)
          .maybeSingle();

        if (profileError && profileError.code !== 'PGRST116') {
          console.error('Error loading profile data:', profileError);
        }

        // Merge data and update form
        if (farmerData || profileData) {
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
            totalLandAcres: profileData?.total_land_acres || farmerData?.total_land_acres || user.totalLandAcres || 0,
            primaryCrops: (profileData?.primary_crops || farmerData?.primary_crops || user.primaryCrops || []).join(', '),
            farmingExperienceYears: profileData?.farming_experience_years || farmerData?.farming_experience_years || user.farmingExperienceYears || 0,
            farmType: farmerData?.farm_type || user.farmType || '',
            hasLoan: farmerData?.has_loan ?? false,
            loanAmount: farmerData?.loan_amount || 0,
            hasTractor: profileData?.has_tractor ?? farmerData?.has_tractor ?? user.hasTractor ?? false,
            hasIrrigation: profileData?.has_irrigation ?? farmerData?.has_irrigation ?? user.hasIrrigation ?? false,
            irrigationType: farmerData?.irrigation_type || user.irrigationType || '',
            hasStorage: profileData?.has_storage ?? farmerData?.has_storage ?? user.hasStorage ?? false,
            annualIncomeRange: profileData?.annual_income_range || farmerData?.annual_income_range || user.annualIncomeRange || '',
            preferredLanguage: profileData?.preferred_language || farmerData?.language_preference || user.preferredLanguage || 'hi',
            notes: farmerData?.notes || ''
          };

          setFormData(mergedData);
          
          // Update avatar if available
          if (profileData?.avatar_url) {
            setAvatarUrl(profileData.avatar_url);
          }
        }
      } catch (error) {
        console.error('Error loading profile:', error);
        toast({
          title: 'Error',
          description: 'Failed to load profile data',
          variant: 'destructive'
        });
      } finally {
        setDataLoading(false);
      }
    };

    loadProfileData();
  }, [user?.id]);

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
      // Create authenticated client with custom headers
      const authClient = supabaseWithAuth(user.id, user.tenantId);
      console.log('🔐 Saving profile with authenticated client:', { userId: user.id, tenantId: user.tenantId });
      
      // Parse crops string to array
      const cropsArray = formData.primaryCrops
        .split(',')
        .map(crop => crop.trim())
        .filter(crop => crop.length > 0);

      // Update farmers table
      const { error: farmerError } = await authClient
        .from('farmers')
        .update({
          total_land_acres: formData.totalLandAcres,
          primary_crops: cropsArray,
          farming_experience_years: formData.farmingExperienceYears,
          farm_type: formData.farmType,
          has_loan: formData.hasLoan,
          loan_amount: formData.loanAmount,
          has_tractor: formData.hasTractor,
          has_irrigation: formData.hasIrrigation,
          irrigation_type: formData.irrigationType,
          has_storage: formData.hasStorage,
          annual_income_range: formData.annualIncomeRange,
          language_preference: formData.preferredLanguage,
          preferred_contact_method: formData.preferredContactMethod,
          aadhaar_number: formData.aadhaarNumber,
          notes: formData.notes,
          updated_at: new Date().toISOString()
        })
        .eq('id', user.id);

      if (farmerError) {
        console.error('Error updating farmer:', farmerError);
        throw farmerError;
      }

      // Check if profile exists
      const { data: existingProfile } = await authClient
        .from('user_profiles')
        .select('id')
        .eq('farmer_id', user.id)
        .maybeSingle();

      // Update or create user_profiles
      if (existingProfile) {
        const { error: profileError } = await authClient
          .from('user_profiles')
          .update({
            full_name: formData.fullName,
            display_name: formData.displayName,
            date_of_birth: formData.dateOfBirth || null,
            gender: formData.gender || null,
            email: formData.email || null,
            bio: formData.bio || null,
            aadhaar_number: formData.aadhaarNumber || null,
            address_line1: formData.addressLine1 || null,
            address_line2: formData.addressLine2 || null,
            village: formData.village || null,
            taluka: formData.taluka || null,
            district: formData.district || null,
            state: formData.state || null,
            pincode: formData.pincode || null,
            total_land_acres: formData.totalLandAcres,
            primary_crops: cropsArray,
            farming_experience_years: formData.farmingExperienceYears,
            has_tractor: formData.hasTractor,
            has_irrigation: formData.hasIrrigation,
            has_storage: formData.hasStorage,
            annual_income_range: formData.annualIncomeRange,
            preferred_language: formData.preferredLanguage as any,
            updated_at: new Date().toISOString()
          })
          .eq('farmer_id', user.id);

        if (profileError) {
          console.error('Error updating profile:', profileError);
          throw profileError;
        }
      } else {
        const { error: profileError } = await authClient
          .from('user_profiles')
          .insert({
            id: user.id,
            farmer_id: user.id,
            tenant_id: user.tenantId,
            full_name: formData.fullName,
            display_name: formData.displayName,
            date_of_birth: formData.dateOfBirth || null,
            gender: formData.gender || null,
            email: formData.email || null,
            bio: formData.bio || null,
            aadhaar_number: formData.aadhaarNumber || null,
            address_line1: formData.addressLine1 || null,
            address_line2: formData.addressLine2 || null,
            village: formData.village || null,
            taluka: formData.taluka || null,
            district: formData.district || null,
            state: formData.state || null,
            pincode: formData.pincode || null,
            total_land_acres: formData.totalLandAcres,
            primary_crops: cropsArray,
            farming_experience_years: formData.farmingExperienceYears,
            has_tractor: formData.hasTractor,
            has_irrigation: formData.hasIrrigation,
            has_storage: formData.hasStorage,
            annual_income_range: formData.annualIncomeRange,
            preferred_language: formData.preferredLanguage as any,
            mobile_number: user.phone
          });

        if (profileError) {
          console.error('Error creating profile:', profileError);
          throw profileError;
        }
      }

      // Update local user state
      setUser({
        ...user,
        fullName: formData.fullName,
        displayName: formData.displayName,
        dateOfBirth: formData.dateOfBirth,
        gender: formData.gender,
        village: formData.village,
        taluka: formData.taluka,
        district: formData.district,
        state: formData.state,
        pincode: formData.pincode,
        totalLandAcres: formData.totalLandAcres,
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

      toast({
        title: 'Success',
        description: 'Profile updated successfully',
      });

      navigate('/app/profile');
    } catch (error) {
      console.error('Error saving profile:', error);
      toast({
        title: 'Error',
        description: 'Failed to update profile. Please try again.',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-4 space-y-4 pb-24">
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
              >
                <ArrowLeft className="w-5 h-5" />
              </Button>
              <h1 className="text-xl font-bold text-foreground truncate">Edit Profile</h1>
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
                  <p className="text-xs text-muted-foreground">Click to change profile picture</p>
                </div>
              </CardContent>
            </Card>

            {/* Personal Information */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Personal Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="fullName">Full Name</Label>
                  <Input
                    id="fullName"
                    value={formData.fullName}
                    onChange={(e) => handleInputChange('fullName', e.target.value)}
                    placeholder="Enter your full name"
                  />
                </div>
                
                <div>
                  <Label htmlFor="displayName">Display Name</Label>
                  <Input
                    id="displayName"
                    value={formData.displayName}
                    onChange={(e) => handleInputChange('displayName', e.target.value)}
                    placeholder="Name to display in app"
                  />
                </div>

                <div>
                  <Label htmlFor="dateOfBirth">Date of Birth</Label>
                  <Input
                    id="dateOfBirth"
                    type="date"
                    value={formData.dateOfBirth}
                    onChange={(e) => handleInputChange('dateOfBirth', e.target.value)}
                  />
                </div>

                <div>
                  <Label htmlFor="gender">Gender</Label>
                  <Select
                    value={formData.gender}
                    onValueChange={(value) => handleInputChange('gender', value)}
                  >
                    <SelectTrigger id="gender">
                      <SelectValue placeholder="Select gender" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Male">Male</SelectItem>
                      <SelectItem value="Female">Female</SelectItem>
                      <SelectItem value="Other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="email">Email (Optional)</Label>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => handleInputChange('email', e.target.value)}
                    placeholder="your.email@example.com"
                  />
                </div>

                <div>
                  <Label htmlFor="aadhaarNumber">Aadhaar Number (Optional)</Label>
                  <Input
                    id="aadhaarNumber"
                    value={formData.aadhaarNumber}
                    onChange={(e) => handleInputChange('aadhaarNumber', e.target.value)}
                    placeholder="XXXX-XXXX-XXXX"
                    maxLength={12}
                  />
                </div>

                <div>
                  <Label htmlFor="bio">Bio (Optional)</Label>
                  <Textarea
                    id="bio"
                    value={formData.bio}
                    onChange={(e) => handleInputChange('bio', e.target.value)}
                    placeholder="Tell us about yourself"
                    rows={3}
                  />
                </div>
              </CardContent>
            </Card>

      {/* Address Information */}
            <Card>
        <CardHeader>
          <CardTitle className="text-base">Address</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="addressLine1">Address Line 1</Label>
            <Input
              id="addressLine1"
              value={formData.addressLine1}
              onChange={(e) => handleInputChange('addressLine1', e.target.value)}
              placeholder="House/Plot number, Street"
            />
          </div>

          <div>
            <Label htmlFor="addressLine2">Address Line 2 (Optional)</Label>
            <Input
              id="addressLine2"
              value={formData.addressLine2}
              onChange={(e) => handleInputChange('addressLine2', e.target.value)}
              placeholder="Landmark"
            />
          </div>

          <div>
            <Label htmlFor="village">Village</Label>
            <Input
              id="village"
              value={formData.village}
              onChange={(e) => handleInputChange('village', e.target.value)}
              placeholder="Enter village name"
            />
          </div>

          <div>
            <Label htmlFor="taluka">Taluka/Tehsil</Label>
            <Input
              id="taluka"
              value={formData.taluka}
              onChange={(e) => handleInputChange('taluka', e.target.value)}
              placeholder="Enter taluka/tehsil"
            />
          </div>

          <div>
            <Label htmlFor="district">District</Label>
            <Input
              id="district"
              value={formData.district}
              onChange={(e) => handleInputChange('district', e.target.value)}
              placeholder="Enter district"
            />
          </div>

          <div>
            <Label htmlFor="state">State</Label>
            <Input
              id="state"
              value={formData.state}
              onChange={(e) => handleInputChange('state', e.target.value)}
              placeholder="Enter state"
            />
          </div>

          <div>
            <Label htmlFor="pincode">Pincode</Label>
            <Input
              id="pincode"
              value={formData.pincode}
              onChange={(e) => handleInputChange('pincode', e.target.value)}
              placeholder="Enter pincode"
              maxLength={6}
            />
          </div>
        </CardContent>
      </Card>

      {/* Farm Details */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Farm Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="totalLand">Total Land (Acres)</Label>
            <Input
              id="totalLand"
              type="number"
              value={formData.totalLandAcres}
              onChange={(e) => handleInputChange('totalLandAcres', parseFloat(e.target.value) || 0)}
              placeholder="Enter total land in acres"
              min="0"
              step="0.1"
            />
          </div>

          <div>
            <Label htmlFor="crops">Primary Crops (comma separated)</Label>
            <Textarea
              id="crops"
              value={formData.primaryCrops}
              onChange={(e) => handleInputChange('primaryCrops', e.target.value)}
              placeholder="e.g., Wheat, Rice, Cotton"
              rows={2}
            />
          </div>

          <div>
            <Label htmlFor="experience">Farming Experience (Years)</Label>
            <Input
              id="experience"
              type="number"
              value={formData.farmingExperienceYears}
              onChange={(e) => handleInputChange('farmingExperienceYears', parseInt(e.target.value) || 0)}
              placeholder="Years of experience"
              min="0"
            />
          </div>

          <div>
            <Label htmlFor="farmType">Farm Type</Label>
            <Select
              value={formData.farmType}
              onValueChange={(value) => handleInputChange('farmType', value)}
            >
              <SelectTrigger id="farmType">
                <SelectValue placeholder="Select farm type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Small">Small (&lt; 2 acres)</SelectItem>
                <SelectItem value="Medium">Medium (2-5 acres)</SelectItem>
                <SelectItem value="Large">Large (&gt; 5 acres)</SelectItem>
                <SelectItem value="Commercial">Commercial</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="income">Annual Income Range</Label>
            <Select
              value={formData.annualIncomeRange}
              onValueChange={(value) => handleInputChange('annualIncomeRange', value)}
            >
              <SelectTrigger id="income">
                <SelectValue placeholder="Select income range" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="< 1 Lakh">Less than 1 Lakh</SelectItem>
                <SelectItem value="1-3 Lakhs">1-3 Lakhs</SelectItem>
                <SelectItem value="3-5 Lakhs">3-5 Lakhs</SelectItem>
                <SelectItem value="5-10 Lakhs">5-10 Lakhs</SelectItem>
                <SelectItem value="> 10 Lakhs">More than 10 Lakhs</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="hasLoan">Has Agricultural Loan</Label>
            <Switch
              id="hasLoan"
              checked={formData.hasLoan}
              onCheckedChange={(checked) => handleInputChange('hasLoan', checked)}
            />
          </div>

          {formData.hasLoan && (
            <div>
              <Label htmlFor="loanAmount">Loan Amount (₹)</Label>
              <Input
                id="loanAmount"
                type="number"
                value={formData.loanAmount}
                onChange={(e) => handleInputChange('loanAmount', parseFloat(e.target.value) || 0)}
                placeholder="Enter loan amount"
                min="0"
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Facilities */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Facilities</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <Label htmlFor="tractor">Has Tractor</Label>
            <Switch
              id="tractor"
              checked={formData.hasTractor}
              onCheckedChange={(checked) => handleInputChange('hasTractor', checked)}
            />
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="irrigation">Has Irrigation</Label>
            <Switch
              id="irrigation"
              checked={formData.hasIrrigation}
              onCheckedChange={(checked) => handleInputChange('hasIrrigation', checked)}
            />
          </div>

          {formData.hasIrrigation && (
            <div>
              <Label htmlFor="irrigationType">Irrigation Type</Label>
              <Select
                value={formData.irrigationType}
                onValueChange={(value) => handleInputChange('irrigationType', value)}
              >
                <SelectTrigger id="irrigationType">
                  <SelectValue placeholder="Select irrigation type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Drip">Drip</SelectItem>
                  <SelectItem value="Sprinkler">Sprinkler</SelectItem>
                  <SelectItem value="Canal">Canal</SelectItem>
                  <SelectItem value="Tubewell">Tubewell</SelectItem>
                  <SelectItem value="Rainfed">Rainfed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="flex items-center justify-between">
            <Label htmlFor="storage">Has Storage Facility</Label>
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
          <CardTitle className="text-base">Preferences & Notes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="language">Preferred Language</Label>
            <Select
              value={formData.preferredLanguage}
              onValueChange={(value) => handleInputChange('preferredLanguage', value)}
            >
              <SelectTrigger id="language">
                <SelectValue placeholder="Select language" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="en">English</SelectItem>
                <SelectItem value="hi">हिंदी</SelectItem>
                <SelectItem value="pa">ਪੰਜਾਬੀ</SelectItem>
                <SelectItem value="mr">मराठी</SelectItem>
                <SelectItem value="ta">தமிழ்</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="contactMethod">Preferred Contact Method</Label>
            <Select
              value={formData.preferredContactMethod}
              onValueChange={(value) => handleInputChange('preferredContactMethod', value)}
            >
              <SelectTrigger id="contactMethod">
                <SelectValue placeholder="Select contact method" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="phone">Phone</SelectItem>
                <SelectItem value="sms">SMS</SelectItem>
                <SelectItem value="whatsapp">WhatsApp</SelectItem>
                <SelectItem value="email">Email</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="notes">Additional Notes (Optional)</Label>
            <Textarea
              id="notes"
              value={formData.notes}
              onChange={(e) => handleInputChange('notes', e.target.value)}
              placeholder="Any additional information..."
              rows={3}
            />
          </div>
        </CardContent>
      </Card>

            {/* Fixed Bottom Action Bar */}
            <div className="fixed bottom-16 left-0 right-0 p-4 bg-background/95 backdrop-blur-sm border-t z-10">
              <div className="max-w-2xl mx-auto flex gap-3">
                <Button
                  onClick={() => navigate('/app/profile')}
                  variant="outline"
                  className="flex-1"
                  disabled={loading}
                >
                  Cancel
                </Button>
                
                <Button
                  onClick={handleSave}
                  className="flex-1"
                  disabled={loading}
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4 mr-2" />
                      Save
                    </>
                  )}
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
