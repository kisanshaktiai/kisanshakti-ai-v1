import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Droplets, Leaf, TestTube, Activity } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { SoilReportHeader } from '@/components/soil/SoilReportHeader';
import { SoilReportBanner } from '@/components/soil/SoilReportBanner';
import { NutrientCard } from '@/components/soil/NutrientCard';
import { SoilHealthSkeleton } from '@/components/skeletons';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

type SoilData = any;

export default function SoilHealthReport() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const reportRef = useRef<HTMLDivElement>(null);
  
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [data, setData] = useState<SoilData>(null);

  useEffect(() => {
    fetchData();
  }, [id]);

  const fetchData = async () => {
    try {
      setLoading(true);
      
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

      const { data: profileData } = await supabase
        .from('user_profiles')
        .select('full_name, farmer_code')
        .eq('farmer_id', soilData.farmer_id)
        .maybeSingle();

      const { data: landData } = await supabase
        .from('lands')
        .select('name')
        .eq('id', soilData.land_id)
        .maybeSingle();

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
        windowHeight: reportRef.current.scrollHeight,
      });
      
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      const imgWidth = pdfWidth;
      const imgHeight = (canvas.height * pdfWidth) / canvas.width;
      
      let heightLeft = imgHeight;
      let position = 0;
      
      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
      heightLeft -= pdfHeight;
      
      while (heightLeft > 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
        heightLeft -= pdfHeight;
      }
      
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
        windowHeight: reportRef.current.scrollHeight,
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
      const canvas = await html2canvas(reportRef.current, { 
        scale: 2,
        windowHeight: reportRef.current.scrollHeight,
      });
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

  const getNutrientProgress = (value: number | null, max = 100) => {
    if (!value) return 0;
    return Math.min((value / max) * 100, 100);
  };

  if (loading) {
    return <SoilHealthSkeleton />;
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20 flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center space-y-4">
            <h2 className="text-xl font-semibold">No Data Available</h2>
            <p className="text-sm text-muted-foreground">No soil health data found for this land</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20">
      <SoilReportHeader
        landName={data.lands?.name}
        exporting={exporting}
        onBack={() => navigate(-1)}
        onDownloadPDF={downloadAsPDF}
        onDownloadImage={downloadAsImage}
        onShare={shareReport}
      />

      <div className="max-w-4xl mx-auto p-4 pb-8" ref={reportRef}>
        <SoilReportBanner
          farmerName={data.user_profiles?.full_name}
          farmerCode={data.user_profiles?.farmer_code}
          landName={data.lands?.name}
          fertilityClass={data.fertility_class}
          testDate={data.test_date}
          fieldArea={data.field_area_ha}
          soilType={data.soil_type}
        />

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
              {data.ph_text && <p className="text-sm text-muted-foreground">{data.ph_text}</p>}
              {data.ph_level && <Progress value={getNutrientProgress(data.ph_level, 14)} className="mt-3 h-2" />}
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
              {data.organic_carbon_text && <p className="text-sm text-muted-foreground">{data.organic_carbon_text}</p>}
              {data.organic_carbon && <Progress value={getNutrientProgress(data.organic_carbon, 5)} className="mt-3 h-2" />}
            </CardContent>
          </Card>
        </div>

        <Card className="mb-4 border-2 shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TestTube className="h-5 w-5 text-primary" />
              Primary Nutrients (NPK)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <NutrientCard
              icon={TestTube}
              title="Nitrogen"
              description="Essential for leaf growth"
              letter="N"
              letterColor="bg-blue-500/10 text-blue-600"
              level={data.nitrogen_level}
              kgPerHa={data.nitrogen_kg_per_ha}
              totalKg={data.nitrogen_total_kg}
              text={data.nitrogen_text}
              maxValue={500}
            />
            <Separator />
            <NutrientCard
              icon={TestTube}
              title="Phosphorus"
              description="Important for root development"
              letter="P"
              letterColor="bg-orange-500/10 text-orange-600"
              level={data.phosphorus_level}
              kgPerHa={data.phosphorus_kg_per_ha}
              totalKg={data.phosphorus_total_kg}
              text={data.phosphorus_text}
              maxValue={100}
            />
            <Separator />
            <NutrientCard
              icon={TestTube}
              title="Potassium"
              description="Vital for overall plant health"
              letter="K"
              letterColor="bg-purple-500/10 text-purple-600"
              level={data.potassium_level}
              kgPerHa={data.potassium_kg_per_ha}
              totalKg={data.potassium_total_kg}
              text={data.potassium_text}
              maxValue={500}
            />
          </CardContent>
        </Card>

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
