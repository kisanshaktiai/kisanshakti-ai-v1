import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Download, Share2, FileText, Image as ImageIcon, Droplets, Activity, Leaf, TestTube, Calendar, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

export default function SoilHealthReport() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const reportRef = useRef<HTMLDivElement>(null);
  
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    fetchData();
  }, [id]);

  const fetchData = async () => {
    try {
      setLoading(true);
      
      // Fetch soil health data
      const { data: soilData, error: soilError } = await supabase
        .from('soil_health')
        .select('*')
        .eq('land_id', id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (soilError) throw soilError;
      if (!soilData) {
        toast({ title: 'No Data', description: 'No soil health data available', variant: 'destructive' });
        navigate(-1);
        return;
      }

      // Fetch user profile data
      const { data: profileData, error: profileError } = await supabase
        .from('user_profiles')
        .select('full_name, farmer_code')
        .eq('farmer_id', soilData.farmer_id)
        .maybeSingle();

      if (profileError) throw profileError;

      // Fetch land data
      const { data: landData, error: landError } = await supabase
        .from('lands')
        .select('name')
        .eq('id', soilData.land_id)
        .maybeSingle();

      if (landError) throw landError;

      // Combine the data
      setData({
        ...soilData,
        user_profiles: profileData,
        lands: landData
      });
    } catch (error) {
      console.error('Error:', error);
      toast({ title: 'Error', description: 'Failed to load data', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const downloadAsPDF = async () => {
    if (!reportRef.current) return;
    
    try {
      setExporting(true);
      const canvas = await html2canvas(reportRef.current, {
        scale: 2,
        useCORS: true,
        logging: false,
      });
      
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
      
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
      pdf.save(`soil-health-report-${data.lands?.name || 'report'}.pdf`);
      
      toast({ title: 'Success', description: 'PDF downloaded successfully' });
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to generate PDF', variant: 'destructive' });
    } finally {
      setExporting(false);
    }
  };

  const downloadAsImage = async () => {
    if (!reportRef.current) return;
    
    try {
      setExporting(true);
      const canvas = await html2canvas(reportRef.current, {
        scale: 2,
        useCORS: true,
        logging: false,
      });
      
      canvas.toBlob((blob) => {
        if (blob) {
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = `soil-health-report-${data.lands?.name || 'report'}.jpg`;
          link.click();
          URL.revokeObjectURL(url);
          toast({ title: 'Success', description: 'Image downloaded successfully' });
        }
      }, 'image/jpeg', 0.95);
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to generate image', variant: 'destructive' });
    } finally {
      setExporting(false);
    }
  };

  const shareReport = async () => {
    if (!reportRef.current) return;
    
    try {
      const canvas = await html2canvas(reportRef.current, { scale: 2 });
      canvas.toBlob(async (blob) => {
        if (blob && navigator.share) {
          const file = new File([blob], 'soil-report.jpg', { type: 'image/jpeg' });
          await navigator.share({
            title: 'Soil Health Report',
            text: `Soil Health Report for ${data.lands?.name}`,
            files: [file]
          });
        } else {
          toast({ title: 'Info', description: 'Sharing not supported. Use download instead.' });
        }
      }, 'image/jpeg');
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to share', variant: 'destructive' });
    }
  };

  const getNutrientColor = (level: string | null) => {
    if (!level) return 'bg-muted';
    const normalized = level.toLowerCase();
    if (normalized.includes('high') || normalized.includes('good')) return 'bg-success';
    if (normalized.includes('medium') || normalized.includes('moderate')) return 'bg-warning';
    return 'bg-destructive';
  };

  const getNutrientProgress = (value: number | null, max: number = 100) => {
    if (!value) return 0;
    return Math.min((value / max) * 100, 100);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20 flex items-center justify-center p-4">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary border-t-transparent mx-auto" />
          <p className="text-muted-foreground">Loading soil health data...</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20 flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center space-y-4">
            <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto">
              <FileText className="h-8 w-8 text-muted-foreground" />
            </div>
            <h2 className="text-xl font-semibold">No Data Available</h2>
            <p className="text-sm text-muted-foreground">No soil health data found for this land</p>
            <Button onClick={() => navigate(-1)} className="w-full">Go Back</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-background/95 backdrop-blur-lg border-b shadow-sm">
        <div className="max-w-4xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div className="flex-1 min-w-0">
                <h1 className="font-bold text-lg truncate">Soil Health Report</h1>
                <p className="text-xs text-muted-foreground truncate">{data.lands?.name}</p>
              </div>
            </div>
            
            {/* Action Buttons */}
            <div className="flex gap-2">
              <Button 
                variant="outline" 
                size="icon" 
                onClick={downloadAsPDF}
                disabled={exporting}
                className="hidden sm:flex"
              >
                <FileText className="h-4 w-4" />
              </Button>
              <Button 
                variant="outline" 
                size="icon" 
                onClick={downloadAsImage}
                disabled={exporting}
                className="hidden sm:flex"
              >
                <ImageIcon className="h-4 w-4" />
              </Button>
              <Button 
                variant="default" 
                size="icon" 
                onClick={shareReport}
                disabled={exporting}
              >
                <Share2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
          
          {/* Mobile Download Buttons */}
          <div className="flex gap-2 mt-3 sm:hidden">
            <Button 
              variant="outline" 
              onClick={downloadAsPDF}
              disabled={exporting}
              className="flex-1"
            >
              <FileText className="h-4 w-4 mr-2" />
              PDF
            </Button>
            <Button 
              variant="outline" 
              onClick={downloadAsImage}
              disabled={exporting}
              className="flex-1"
            >
              <Download className="h-4 w-4 mr-2" />
              Image
            </Button>
          </div>
        </div>
      </div>

      {/* Report Content */}
      <div className="max-w-4xl mx-auto p-4 pb-8" ref={reportRef}>
        {/* Header Card */}
        <Card className="mb-4 overflow-hidden border-2 shadow-lg">
          <div className="bg-gradient-to-r from-primary to-primary/80 p-6 text-primary-foreground">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <Activity className="h-5 w-5" />
                  <h2 className="text-xl font-bold">Soil Health Analysis</h2>
                </div>
                <p className="text-sm opacity-90 mb-1">{data.user_profiles?.full_name}</p>
                <p className="text-xs opacity-75">Farmer Code: {data.user_profiles?.farmer_code}</p>
              </div>
              <Badge variant="secondary" className="bg-white/20 text-white border-white/30">
                {data.fertility_class || 'Analysis'}
              </Badge>
            </div>
            
            <Separator className="my-4 bg-white/20" />
            
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 opacity-75" />
                <span className="opacity-90">{data.lands?.name}</span>
              </div>
              {data.test_date && (
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 opacity-75" />
                  <span className="opacity-90">{new Date(data.test_date).toLocaleDateString()}</span>
                </div>
              )}
              {data.field_area_ha && (
                <div className="flex items-center gap-2">
                  <Leaf className="h-4 w-4 opacity-75" />
                  <span className="opacity-90">{data.field_area_ha} hectares</span>
                </div>
              )}
              {data.soil_type && (
                <div className="flex items-center gap-2">
                  <TestTube className="h-4 w-4 opacity-75" />
                  <span className="opacity-90">{data.soil_type}</span>
                </div>
              )}
            </div>
          </div>
        </Card>

        {/* pH Level & Organic Carbon */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <Card className="border-2 hover:shadow-lg transition-shadow">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <div className="p-2 bg-blue-500/10 rounded-lg">
                  <Droplets className="h-4 w-4 text-blue-500" />
                </div>
                pH Level
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold mb-2 text-blue-600">
                {data.ph_level?.toFixed(1) || 'N/A'}
              </div>
              {data.ph_text && (
                <p className="text-sm text-muted-foreground">{data.ph_text}</p>
              )}
              {data.ph_level && (
                <Progress value={getNutrientProgress(data.ph_level, 14)} className="mt-3 h-2" />
              )}
            </CardContent>
          </Card>

          <Card className="border-2 hover:shadow-lg transition-shadow">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <div className="p-2 bg-green-500/10 rounded-lg">
                  <Leaf className="h-4 w-4 text-green-500" />
                </div>
                Organic Carbon
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold mb-2 text-green-600">
                {data.organic_carbon?.toFixed(2) || 'N/A'}%
              </div>
              {data.organic_carbon_text && (
                <p className="text-sm text-muted-foreground">{data.organic_carbon_text}</p>
              )}
              {data.organic_carbon && (
                <Progress value={getNutrientProgress(data.organic_carbon, 5)} className="mt-3 h-2" />
              )}
            </CardContent>
          </Card>
        </div>

        {/* NPK Nutrients */}
        <Card className="mb-4 border-2 shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TestTube className="h-5 w-5 text-primary" />
              Primary Nutrients (NPK)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Nitrogen */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center">
                    <span className="text-lg font-bold text-blue-600">N</span>
                  </div>
                  <div>
                    <p className="font-semibold">Nitrogen</p>
                    <p className="text-xs text-muted-foreground">Essential for leaf growth</p>
                  </div>
                </div>
                <Badge className={getNutrientColor(data.nitrogen_level)}>
                  {data.nitrogen_level || 'N/A'}
                </Badge>
              </div>
              <div className="grid grid-cols-2 gap-4 pl-13">
                <div>
                  <p className="text-2xl font-bold text-blue-600">{data.nitrogen_kg_per_ha || 'N/A'}</p>
                  <p className="text-xs text-muted-foreground">kg/ha</p>
                </div>
                {data.nitrogen_total_kg && (
                  <div>
                    <p className="text-2xl font-bold text-blue-600">{data.nitrogen_total_kg}</p>
                    <p className="text-xs text-muted-foreground">Total kg</p>
                  </div>
                )}
              </div>
              {data.nitrogen_text && (
                <p className="text-sm text-muted-foreground mt-2 pl-13">{data.nitrogen_text}</p>
              )}
              {data.nitrogen_kg_per_ha && (
                <Progress value={getNutrientProgress(data.nitrogen_kg_per_ha, 500)} className="mt-3 h-2" />
              )}
            </div>

            <Separator />

            {/* Phosphorus */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-orange-500/10 flex items-center justify-center">
                    <span className="text-lg font-bold text-orange-600">P</span>
                  </div>
                  <div>
                    <p className="font-semibold">Phosphorus</p>
                    <p className="text-xs text-muted-foreground">Important for root development</p>
                  </div>
                </div>
                <Badge className={getNutrientColor(data.phosphorus_level)}>
                  {data.phosphorus_level || 'N/A'}
                </Badge>
              </div>
              <div className="grid grid-cols-2 gap-4 pl-13">
                <div>
                  <p className="text-2xl font-bold text-orange-600">{data.phosphorus_kg_per_ha || 'N/A'}</p>
                  <p className="text-xs text-muted-foreground">kg/ha</p>
                </div>
                {data.phosphorus_total_kg && (
                  <div>
                    <p className="text-2xl font-bold text-orange-600">{data.phosphorus_total_kg}</p>
                    <p className="text-xs text-muted-foreground">Total kg</p>
                  </div>
                )}
              </div>
              {data.phosphorus_text && (
                <p className="text-sm text-muted-foreground mt-2 pl-13">{data.phosphorus_text}</p>
              )}
              {data.phosphorus_kg_per_ha && (
                <Progress value={getNutrientProgress(data.phosphorus_kg_per_ha, 100)} className="mt-3 h-2" />
              )}
            </div>

            <Separator />

            {/* Potassium */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-purple-500/10 flex items-center justify-center">
                    <span className="text-lg font-bold text-purple-600">K</span>
                  </div>
                  <div>
                    <p className="font-semibold">Potassium</p>
                    <p className="text-xs text-muted-foreground">Vital for overall plant health</p>
                  </div>
                </div>
                <Badge className={getNutrientColor(data.potassium_level)}>
                  {data.potassium_level || 'N/A'}
                </Badge>
              </div>
              <div className="grid grid-cols-2 gap-4 pl-13">
                <div>
                  <p className="text-2xl font-bold text-purple-600">{data.potassium_kg_per_ha || 'N/A'}</p>
                  <p className="text-xs text-muted-foreground">kg/ha</p>
                </div>
                {data.potassium_total_kg && (
                  <div>
                    <p className="text-2xl font-bold text-purple-600">{data.potassium_total_kg}</p>
                    <p className="text-xs text-muted-foreground">Total kg</p>
                  </div>
                )}
              </div>
              {data.potassium_text && (
                <p className="text-sm text-muted-foreground mt-2 pl-13">{data.potassium_text}</p>
              )}
              {data.potassium_kg_per_ha && (
                <Progress value={getNutrientProgress(data.potassium_kg_per_ha, 500)} className="mt-3 h-2" />
              )}
            </div>
          </CardContent>
        </Card>

        {/* Soil Composition */}
        {(data.sand_percent || data.silt_percent || data.clay_percent || data.texture) && (
          <Card className="mb-4 border-2 shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5 text-primary" />
                Soil Composition
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {data.texture && (
                  <div className="col-span-2 md:col-span-3 mb-2">
                    <p className="text-sm text-muted-foreground mb-1">Texture</p>
                    <p className="text-lg font-semibold">{data.texture}</p>
                  </div>
                )}
                {data.sand_percent !== null && (
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Sand</p>
                    <p className="text-2xl font-bold text-yellow-600">{data.sand_percent}%</p>
                    <Progress value={data.sand_percent} className="mt-2 h-2" />
                  </div>
                )}
                {data.silt_percent !== null && (
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Silt</p>
                    <p className="text-2xl font-bold text-amber-600">{data.silt_percent}%</p>
                    <Progress value={data.silt_percent} className="mt-2 h-2" />
                  </div>
                )}
                {data.clay_percent !== null && (
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Clay</p>
                    <p className="text-2xl font-bold text-red-600">{data.clay_percent}%</p>
                    <Progress value={data.clay_percent} className="mt-2 h-2" />
                  </div>
                )}
                {data.bulk_density !== null && (
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Bulk Density</p>
                    <p className="text-xl font-semibold">{data.bulk_density} g/cm³</p>
                  </div>
                )}
                {data.cec !== null && (
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">CEC</p>
                    <p className="text-xl font-semibold">{data.cec} meq/100g</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Additional Information */}
        {(data.note || data.source || data.confidence_level) && (
          <Card className="border-2 shadow-lg">
            <CardHeader>
              <CardTitle className="text-base">Additional Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {data.note && (
                <div>
                  <p className="text-sm font-medium mb-1">Notes</p>
                  <p className="text-sm text-muted-foreground">{data.note}</p>
                </div>
              )}
              {data.source && (
                <div>
                  <p className="text-sm font-medium mb-1">Data Source</p>
                  <Badge variant="outline">{data.source}</Badge>
                </div>
              )}
              {data.confidence_level && (
                <div>
                  <p className="text-sm font-medium mb-1">Confidence Level</p>
                  <Badge variant="secondary">{data.confidence_level}</Badge>
                </div>
              )}
              {data.data_completeness && (
                <div>
                  <p className="text-sm font-medium mb-1">Data Completeness</p>
                  <div className="flex items-center gap-3">
                    <Progress value={data.data_completeness} className="flex-1 h-2" />
                    <span className="text-sm font-semibold">{data.data_completeness}%</span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
