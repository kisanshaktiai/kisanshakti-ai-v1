import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useGoogleMapsApi } from '@/hooks/useGoogleMapsApi';
import { useTranslation } from 'react-i18next';
import { 
  MapPin, 
  Mountain, 
  Droplets, 
  Calendar, 
  MoreVertical, 
  Eye, 
  Edit, 
  Trash2,
  Sprout,
  Plus,
  Clock,
  Wheat
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { CropManagementDialog } from './CropManagementDialog';
import { useLandRefLabels } from '@/hooks/useLandRefLabels';
import { format } from 'date-fns';

interface LandCardProps {
  land: {
    id: string;
    name: string;
    area: number;
    village?: string;
    district?: string;
    state?: string;
    survey_number?: string;
    ownership_type?: string;
    soil_type?: string;
    water_source?: string;
    current_crop?: string;
    planting_date?: string;
    expected_harvest_date?: string;
    previous_crop?: string;
    harvest_date?: string;
    boundary?: Array<{lat: number; lng: number}>;
    center_point?: {lat: number; lng: number};
  };
  onEdit?: () => void;
  onDelete?: () => void;
}

export function LandCard({ land, onEdit, onDelete }: LandCardProps) {
  const navigate = useNavigate();
  const [cropDialogOpen, setCropDialogOpen] = useState(false);
  const { apiKey, isLoaded } = useGoogleMapsApi();
  const { t } = useTranslation();
  const refLabels = useLandRefLabels();
  
  // Generate static map URL with boundary polygon
  const getStaticMapUrl = () => {
    if (!land.boundary || land.boundary.length === 0 || !apiKey) return null;
    
    // Create path from boundary points
    const path = land.boundary
      .map(point => `${point.lat},${point.lng}`)
      .join('|');
    
    // Center point for map
    const center = land.center_point 
      ? `${land.center_point.lat},${land.center_point.lng}`
      : land.boundary[0] ? `${land.boundary[0].lat},${land.boundary[0].lng}` : '';
    
    // Generate map URL with green filled polygon
    return `https://maps.googleapis.com/maps/api/staticmap?` +
      `center=${center}` +
      `&zoom=15` +
      `&size=400x200` +
      `&maptype=satellite` +
      `&path=color:0x00ff00|weight:3|fillcolor:0x00ff0033|${path}` +
      `&key=${apiKey}`;
  };

  const mapUrl = getStaticMapUrl();

  const handleCropSuccess = () => {
    // Refresh the land data if needed
    window.location.reload();
  };

  return (
    <>
      <Card className="group hover:shadow-lg transition-all duration-300 overflow-hidden">
        {/* Map Preview with Mask */}
        {mapUrl && (
          <div className="relative h-40 bg-muted overflow-hidden">
            <img 
              src={mapUrl} 
              alt={`Map of ${land.name}`}
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-background/80 to-transparent" />
            <Badge className="absolute top-2 left-2 bg-background/90 backdrop-blur">
              <Mountain className="h-3 w-3 mr-1" />
              {land.area.toFixed(2)} {t('lands.list_item.acres')}
            </Badge>
          </div>
        )}
        
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <h3 className="font-semibold text-lg">{land.name}</h3>
              {land.survey_number && (
                <p className="text-xs text-muted-foreground">
                  {t('lands.card.survey_no', { number: land.survey_number })}
                </p>
              )}
            </div>
            <div className="flex items-center gap-1">
              {land.ownership_type && (
                <Badge variant="secondary" className="text-xs">
                  {land.ownership_type}
                </Badge>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => navigate(`/app/lands/${land.id}`)}>
                    <Eye className="h-4 w-4 mr-2" />
                    {t('lands.card.view_details')}
                  </DropdownMenuItem>
                  {onEdit && (
                    <DropdownMenuItem onClick={onEdit}>
                      <Edit className="h-4 w-4 mr-2" />
                      {t('lands.card.edit')}
                    </DropdownMenuItem>
                  )}
                  {onDelete && (
                    <DropdownMenuItem onClick={onDelete} className="text-destructive">
                      <Trash2 className="h-4 w-4 mr-2" />
                      {t('lands.card.delete')}
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </CardHeader>
        
        <CardContent className="space-y-4">
          {/* Location Info */}
          <div className="flex items-start gap-2">
            <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
            <div className="text-sm">
              <p className="font-medium">{land.village || t('lands.wizard.form.location_details')}</p>
              {(land.district || land.state) && (
                <p className="text-muted-foreground">
                  {refLabels.location({ district: land.district, state: land.state })}
                </p>
              )}
            </div>
          </div>
          
          {/* Land Details */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            {land.soil_type && (() => {
              const d = refLabels.display(land.soil_type, 'soil');
              return (
                <div className="flex items-center gap-1.5">
                  <div className="h-2 w-2 bg-warning rounded-full" />
                  <span className="text-muted-foreground">Soil:</span>
                  <span className={`font-medium capitalize ${d.isFallback ? 'italic text-muted-foreground' : ''}`}>{d.text}</span>
                </div>
              );
            })()}
            {land.water_source && (() => {
              const d = refLabels.display(land.water_source, 'water');
              return (
                <div className="flex items-center gap-1.5">
                  <Droplets className="h-3 w-3 text-info" />
                  <span className="text-muted-foreground">Water:</span>
                  <span className={`font-medium capitalize ${d.isFallback ? 'italic text-muted-foreground' : ''}`}>{d.text}</span>
                </div>
              );
            })()}

          </div>
          
          {/* Crop Information Section */}
          <div className="border-t pt-3 space-y-3">
            {land.current_crop ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Wheat className="h-4 w-4 text-primary" />
                    <span className="text-sm font-medium">{t('lands.wizard.form.current_crop')}</span>
                  </div>
                  <Badge variant="default" className="text-xs">
                    {refLabels.crop(land.current_crop) || land.current_crop}
                  </Badge>
                </div>
                {land.planting_date && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Calendar className="h-3 w-3" />
                    {t('lands.details.last_sowing')}: {format(new Date(land.planting_date), 'dd MMM yyyy')}
                  </div>
                )}
                {land.expected_harvest_date && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    {t('lands.details.expected_harvest')}: {format(new Date(land.expected_harvest_date), 'dd MMM yyyy')}
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center justify-center py-2 border-2 border-dashed rounded-lg">
                <p className="text-sm text-muted-foreground">{t('lands.details.no_crop')}</p>
              </div>
            )}
            
            {/* Add/Manage Crop Button */}
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => setCropDialogOpen(true)}
            >
              {land.current_crop ? (
                <>
                  <Edit className="h-4 w-4 mr-2" />
                  {t('lands.card.manage_crops')}
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4 mr-2" />
                  {t('lands.card.add_crop')}
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Crop Management Dialog */}
      <CropManagementDialog
        open={cropDialogOpen}
        onClose={() => setCropDialogOpen(false)}
        landId={land.id}
        landName={land.name}
        onSuccess={handleCropSuccess}
      />
    </>
  );
}