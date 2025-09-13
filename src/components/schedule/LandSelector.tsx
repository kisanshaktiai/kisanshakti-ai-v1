import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { MapPin, Droplets, Mountain, FileText, ChevronRight } from 'lucide-react';

interface Land {
  id: string;
  name: string;
  area_acres: number;
  area_guntas?: number;
  village?: string;
  taluka?: string;
  district?: string;
  state?: string;
  survey_number?: string;
  soil_type?: string;
  water_source?: string;
  irrigation_type?: string;
  current_crop?: string;
}

interface LandSelectorProps {
  lands: Land[];
  onSelectLand: (land: Land) => void;
}

const LandSelector: React.FC<LandSelectorProps> = ({ lands, onSelectLand }) => {
  return (
    <div className="space-y-4">
      <div className="mb-6">
        <h2 className="text-xl font-semibold mb-2">Select Your Land</h2>
        <p className="text-muted-foreground">Choose a land parcel to generate AI crop schedule</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {lands.map((land) => (
          <Card 
            key={land.id} 
            className="cursor-pointer hover:shadow-lg transition-shadow"
            onClick={() => onSelectLand(land)}
          >
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <CardTitle className="text-lg">{land.name || 'Unnamed Land'}</CardTitle>
                  {land.survey_number && (
                    <div className="flex items-center gap-1 text-sm text-muted-foreground">
                      <FileText className="h-3 w-3" />
                      <span>Survey #{land.survey_number}</span>
                    </div>
                  )}
                </div>
                <ChevronRight className="h-5 w-5 text-muted-foreground" />
              </div>
            </CardHeader>
            
            <CardContent className="space-y-3">
              {/* Area Information */}
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Area:</span>
                <span className="text-sm font-medium">
                  {land.area_acres} acres {land.area_guntas && `${land.area_guntas} guntas`}
                </span>
              </div>

              {/* Location */}
              {(land.village || land.district) && (
                <div className="flex items-start gap-2">
                  <MapPin className="h-3 w-3 text-muted-foreground mt-1" />
                  <div className="text-sm text-muted-foreground">
                    {[land.village, land.taluka, land.district, land.state]
                      .filter(Boolean)
                      .join(', ')}
                  </div>
                </div>
              )}

              {/* Tags for soil and water */}
              <div className="flex flex-wrap gap-2">
                {land.soil_type && (
                  <Badge variant="secondary" className="text-xs">
                    <Mountain className="h-3 w-3 mr-1" />
                    {land.soil_type}
                  </Badge>
                )}
                {land.water_source && (
                  <Badge variant="secondary" className="text-xs">
                    <Droplets className="h-3 w-3 mr-1" />
                    {land.water_source}
                  </Badge>
                )}
                {land.current_crop && (
                  <Badge variant="outline" className="text-xs">
                    🌾 {land.current_crop}
                  </Badge>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default LandSelector;