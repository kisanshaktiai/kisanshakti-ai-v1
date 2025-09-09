import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  MapPin, 
  Droplets, 
  Mountain, 
  Maximize2,
  Edit,
  Trash2 
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';

interface LandCardProps {
  land: {
    id: string;
    name: string;
    area_acres?: number;
    area_guntas?: number;
    survey_number?: string;
    ownership_type?: string;
    village?: string;
    taluka?: string;
    district?: string;
    soil_type?: string;
    water_source?: string;
    current_crop?: string;
    boundary_polygon_old?: any;
    center_point_old?: any;
  };
  onEdit?: (id: string) => void;
  onDelete?: (id: string) => void;
}

export function LandCard({ land, onEdit, onDelete }: LandCardProps) {
  const navigate = useNavigate();
  
  // Generate static map URL if boundary exists
  const getStaticMapUrl = () => {
    if (!land.center_point_old?.coordinates) return null;
    
    const [lng, lat] = land.center_point_old.coordinates;
    const baseUrl = 'https://maps.googleapis.com/maps/api/staticmap';
    
    // Build path from boundary polygon
    let pathParam = '';
    if (land.boundary_polygon_old?.coordinates?.[0]) {
      const coords = land.boundary_polygon_old.coordinates[0]
        .map((coord: number[]) => `${coord[1]},${coord[0]}`)
        .join('|');
      pathParam = `&path=color:0x22c55e|weight:3|fillcolor:0x22c55e33|${coords}`;
    }
    
    // Note: In production, you'd need to add the API key from the edge function
    return `${baseUrl}?center=${lat},${lng}&zoom=17&size=400x200&maptype=satellite${pathParam}`;
  };

  const mapUrl = getStaticMapUrl();

  return (
    <Card className="overflow-hidden hover:shadow-lg transition-shadow">
      {/* Map Preview */}
      {mapUrl && (
        <div className="relative h-32 bg-muted">
          <div className="absolute inset-0 bg-gradient-to-t from-background/80 to-transparent z-10" />
          <img 
            src={mapUrl} 
            alt={`Map of ${land.name}`}
            className="w-full h-full object-cover"
            onError={(e) => {
              // Hide image if it fails to load
              (e.target as HTMLElement).style.display = 'none';
            }}
          />
          <Button
            size="icon"
            variant="ghost"
            className="absolute top-2 right-2 z-20 h-8 w-8 bg-background/80 hover:bg-background"
            onClick={() => navigate(`/app/lands/${land.id}`)}
          >
            <Maximize2 className="h-4 w-4" />
          </Button>
        </div>
      )}
      
      <CardHeader className="pb-3">
        <div className="flex justify-between items-start">
          <div>
            <h3 className="font-semibold text-lg">{land.name}</h3>
            {land.survey_number && (
              <p className="text-sm text-muted-foreground">
                Survey #{land.survey_number}
              </p>
            )}
          </div>
          <Badge variant={land.ownership_type === 'owned' ? 'default' : 'secondary'}>
            {land.ownership_type || 'Owned'}
          </Badge>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-3">
        {/* Area */}
        <div className="flex items-center justify-between p-2 bg-primary/10 rounded-lg">
          <span className="text-sm font-medium">Area</span>
          <div className="text-right">
            {land.area_acres && (
              <div className="font-semibold">{land.area_acres.toFixed(2)} acres</div>
            )}
            {land.area_guntas && (
              <div className="text-xs text-muted-foreground">{land.area_guntas} guntas</div>
            )}
          </div>
        </div>

        {/* Location */}
        {land.village && (
          <div className="flex items-start gap-2 text-sm">
            <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
            <div className="flex-1">
              <p>{land.village}</p>
              {land.taluka && land.district && (
                <p className="text-xs text-muted-foreground">
                  {land.taluka}, {land.district}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Soil & Water */}
        <div className="flex gap-4 text-sm">
          {land.soil_type && (
            <div className="flex items-center gap-1">
              <Mountain className="h-4 w-4 text-muted-foreground" />
              <span>{land.soil_type}</span>
            </div>
          )}
          {land.water_source && (
            <div className="flex items-center gap-1">
              <Droplets className="h-4 w-4 text-muted-foreground" />
              <span>{land.water_source}</span>
            </div>
          )}
        </div>

        {/* Current Crop */}
        {land.current_crop && (
          <Badge variant="outline" className="w-full justify-center">
            Current: {land.current_crop}
          </Badge>
        )}

        {/* Actions */}
        <div className="flex gap-2 pt-2">
          <Button 
            variant="outline" 
            size="sm" 
            className="flex-1"
            onClick={() => navigate(`/app/lands/${land.id}`)}
          >
            View Details
          </Button>
          {onEdit && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onEdit(land.id)}
            >
              <Edit className="h-4 w-4" />
            </Button>
          )}
          {onDelete && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onDelete(land.id)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}