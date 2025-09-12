import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
  
  // Generate static map URL with boundary polygon
  const getStaticMapUrl = () => {
    if (!land.boundary || land.boundary.length === 0) return null;
    
    const API_KEY = 'AIzaSyA7T__VHsi2H8km-jRytv4Mdjzae7Uokjg'; // Google Maps API key from edge function
    
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
      `&key=${API_KEY}`;
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
              {land.area.toFixed(2)} acres
            </Badge>
          </div>
        )}
        
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <h3 className="font-semibold text-lg">{land.name}</h3>
              {land.survey_number && (
                <p className="text-xs text-muted-foreground">
                  Survey No: {land.survey_number}
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
                    View Details
                  </DropdownMenuItem>
                  {onEdit && (
                    <DropdownMenuItem onClick={onEdit}>
                      <Edit className="h-4 w-4 mr-2" />
                      Edit
                    </DropdownMenuItem>
                  )}
                  {onDelete && (
                    <DropdownMenuItem onClick={onDelete} className="text-destructive">
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete
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
              <p className="font-medium">{land.village || 'Location'}</p>
              {(land.district || land.state) && (
                <p className="text-muted-foreground">
                  {[land.district, land.state].filter(Boolean).join(', ')}
                </p>
              )}
            </div>
          </div>
          
          {/* Land Details */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            {land.soil_type && (
              <div className="flex items-center gap-1.5">
                <div className="h-2 w-2 bg-warning rounded-full" />
                <span className="text-muted-foreground">Soil:</span>
                <span className="font-medium capitalize">{land.soil_type.replace('_', ' ')}</span>
              </div>
            )}
            {land.water_source && (
              <div className="flex items-center gap-1.5">
                <Droplets className="h-3 w-3 text-info" />
                <span className="text-muted-foreground">Water:</span>
                <span className="font-medium capitalize">{land.water_source.replace('_', ' ')}</span>
              </div>
            )}
          </div>
          
          {/* Crop Information Section */}
          <div className="border-t pt-3 space-y-3">
            {land.current_crop ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Wheat className="h-4 w-4 text-primary" />
                    <span className="text-sm font-medium">Current Crop</span>
                  </div>
                  <Badge variant="default" className="text-xs">
                    {land.current_crop}
                  </Badge>
                </div>
                {land.planting_date && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Calendar className="h-3 w-3" />
                    Planted: {format(new Date(land.planting_date), 'dd MMM yyyy')}
                  </div>
                )}
                {land.expected_harvest_date && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    Expected Harvest: {format(new Date(land.expected_harvest_date), 'dd MMM yyyy')}
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center justify-center py-2 border-2 border-dashed rounded-lg">
                <p className="text-sm text-muted-foreground">No crop planted</p>
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
                  Manage Crops
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Crop
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