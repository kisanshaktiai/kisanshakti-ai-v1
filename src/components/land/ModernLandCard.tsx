import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { format } from 'date-fns';
import { 
  MapPin, 
  Mountain, 
  Droplets, 
  Calendar, 
  Trash2,
  Edit3,
  Wheat,
  TreePine,
  Globe,
  ChevronRight,
  Clock
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useGoogleMapsApi } from '@/hooks/useGoogleMapsApi';

interface ModernLandCardProps {
  land: {
    id: string;
    name: string;
    area_acres: number;
    area_guntas?: number;
    village?: string;
    district?: string;
    state?: string;
    survey_number?: string;
    ownership_type?: string;
    soil_type?: string;
    water_source?: string;
    irrigation_type?: string;
    current_crop?: string;
    previous_crop?: string;
    planting_date?: string;
    expected_harvest_date?: string;
    boundary_polygon_old?: any;
    center_point_old?: any;
    updated_at?: string;
    created_at?: string;
  };
  onRefresh: () => void;
}

export function ModernLandCard({ land, onRefresh }: ModernLandCardProps) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const { apiKey } = useGoogleMapsApi();
  
  // Generate static map URL with boundary polygon using visible parameter
  const getStaticMapUrl = () => {
    // Return placeholder if API key not loaded yet
    if (!apiKey) {
      return '/placeholder.svg';
    }
    
    try {
      // If no polygon, use center point with default zoom
      if (!land.boundary_polygon_old || !land.boundary_polygon_old.coordinates) {
        if (land.center_point_old?.coordinates) {
          const center = `${land.center_point_old.coordinates[1]},${land.center_point_old.coordinates[0]}`;
          return `https://maps.googleapis.com/maps/api/staticmap?` +
            `center=${center}` +
            `&zoom=16` +
            `&size=600x300` +
            `&maptype=satellite` +
            `&style=feature:all|element:labels|visibility:off` +
            `&style=feature:poi|visibility:off` +
            `&style=feature:road|visibility:off` +
            `&markers=color:green|size:large|${center}` +
            `&key=${apiKey}`;
        }
        return '/placeholder.svg';
      }
      
      // Get polygon coordinates
      const coordinates = land.boundary_polygon_old.coordinates[0];
      if (!coordinates || coordinates.length === 0) return '/placeholder.svg';
      
      // Calculate bounds of the polygon
      let minLat = coordinates[0][1];
      let maxLat = coordinates[0][1];
      let minLng = coordinates[0][0];
      let maxLng = coordinates[0][0];
      
      coordinates.forEach((coord: number[]) => {
        minLat = Math.min(minLat, coord[1]);
        maxLat = Math.max(maxLat, coord[1]);
        minLng = Math.min(minLng, coord[0]);
        maxLng = Math.max(maxLng, coord[0]);
      });
      
      // Add padding to the bounds (25% expansion for better visibility)
      const latDiff = maxLat - minLat;
      const lngDiff = maxLng - minLng;
      const paddingFactor = 0.25;
      
      // Ensure minimum bounds for very small polygons
      const minBoundSize = 0.0005; // Approximately 50 meters
      const effectiveLatDiff = Math.max(latDiff, minBoundSize);
      const effectiveLngDiff = Math.max(lngDiff, minBoundSize);
      
      const paddedMinLat = minLat - (effectiveLatDiff * paddingFactor);
      const paddedMaxLat = maxLat + (effectiveLatDiff * paddingFactor);
      const paddedMinLng = minLng - (effectiveLngDiff * paddingFactor);
      const paddedMaxLng = maxLng + (effectiveLngDiff * paddingFactor);
      
      // Create visible bounds parameter (ensures entire polygon is visible)
      const visibleBounds = `${paddedMinLat},${paddedMinLng}|${paddedMaxLat},${paddedMaxLng}`;
      
      // Create path from boundary points with enhanced styling
      const path = coordinates
        .map((coord: number[]) => `${coord[1]},${coord[0]}`)
        .join('|');
      
      // Generate map URL using visible parameter for automatic zoom/center
      // This ensures the entire polygon is always visible with proper padding
      return `https://maps.googleapis.com/maps/api/staticmap?` +
        `visible=${visibleBounds}` + // Use visible parameter instead of manual zoom/center
        `&size=600x300` +
        `&maptype=satellite` +
        `&style=feature:all|element:labels|visibility:off` +
        `&style=feature:poi|visibility:off` +
        `&style=feature:road|visibility:off` +
        `&style=feature:administrative|visibility:off` +
        `&style=feature:transit|visibility:off` +
        `&style=feature:water|element:labels|visibility:off` +
        `&path=color:0xffffff|weight:4|${path}` + // White border (outer) for contrast
        `&path=color:0x00ff00|weight:2|fillcolor:0x00ff0044|${path}` + // Green fill with border
        `&key=${apiKey}`;
    } catch (error) {
      console.error('Error generating map URL:', error);
      return '/placeholder.svg';
    }
  };

  const mapUrl = getStaticMapUrl();
  
  const handleEdit = () => {
    navigate(`/app/lands/${land.id}/edit`);
  };
  
  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      const { landsApi } = await import('@/services/landsApi');
      await landsApi.deleteLand(land.id);
      
      toast({
        title: 'Land Removed',
        description: `${land.name} has been removed from your lands`,
      });
      
      onRefresh();
    } catch (error) {
      console.error('Error deleting land:', error);
      toast({
        title: 'Error',
        description: 'Failed to remove land',
        variant: 'destructive',
      });
    } finally {
      setIsDeleting(false);
      setDeleteDialogOpen(false);
    }
  };
  
  const formatArea = () => {
    let areaText = `${land.area_acres.toFixed(2)} acres`;
    if (land.area_guntas && land.area_guntas > 0) {
      areaText += ` ${land.area_guntas} guntas`;
    }
    return areaText;
  };
  
  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        whileHover={{ scale: 1.02, y: -5 }}
        whileTap={{ scale: 0.98 }}
        transition={{ duration: 0.2 }}
      >
        <Card className="overflow-hidden cursor-pointer group relative bg-background hover:shadow-2xl transition-all duration-300 border-primary/10">
          {/* Gradient Header with Map */}
          <div className="relative h-48 overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-primary/10 to-transparent z-10" />
            <img 
              src={mapUrl} 
              alt={`${land.name} boundary`}
              className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
              loading="lazy"
            />
            
            {/* Floating Action Buttons */}
            <div className="absolute top-3 right-3 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-20">
              <Button
                size="icon"
                variant="secondary"
                className="h-8 w-8 bg-background/90 backdrop-blur hover:bg-primary hover:text-primary-foreground shadow-lg"
                onClick={(e) => {
                  e.stopPropagation();
                  handleEdit();
                }}
              >
                <Edit3 className="h-4 w-4" />
              </Button>
              <Button
                size="icon"
                variant="secondary"
                className="h-8 w-8 bg-background/90 backdrop-blur hover:bg-destructive hover:text-destructive-foreground shadow-lg"
                onClick={(e) => {
                  e.stopPropagation();
                  setDeleteDialogOpen(true);
                }}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
            
            {/* Area Badge */}
            <Badge className="absolute bottom-3 left-3 bg-background/90 backdrop-blur border-primary/20 z-20">
              <Mountain className="h-3 w-3 mr-1.5" />
              {formatArea()}
            </Badge>
          </div>
          
          <CardContent 
            className="p-4 space-y-4"
            onClick={() => navigate(`/app/lands/${land.id}`)}
          >
            {/* Land Name and Survey Number */}
            <div className="space-y-1">
              <h3 className="font-bold text-lg tracking-tight flex items-center gap-2">
                {land.name}
                <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
              </h3>
              {land.survey_number && (
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  Survey/Gat No: {land.survey_number}
                </p>
              )}
            </div>
            
            {/* Crop Information */}
            <div className="grid grid-cols-2 gap-3">
              {land.current_crop && (
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Current Crop</p>
                  <div className="flex items-center gap-1.5">
                    <Wheat className="h-4 w-4 text-primary" />
                    <span className="text-sm font-medium">{land.current_crop}</span>
                  </div>
                </div>
              )}
              
              {land.previous_crop && (
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Previous Crop</p>
                  <div className="flex items-center gap-1.5">
                    <TreePine className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">{land.previous_crop}</span>
                  </div>
                </div>
              )}
            </div>
            
            {/* Land Details */}
            <div className="flex flex-wrap gap-2">
              {land.irrigation_type && (
                <Badge variant="secondary" className="text-xs">
                  <Droplets className="h-3 w-3 mr-1" />
                  {land.irrigation_type.replace('_', ' ')}
                </Badge>
              )}
              
              {land.soil_type && (
                <Badge variant="outline" className="text-xs">
                  <Globe className="h-3 w-3 mr-1" />
                  {land.soil_type.replace('_', ' ')}
                </Badge>
              )}
              
              {land.ownership_type && (
                <Badge variant="outline" className="text-xs">
                  {land.ownership_type}
                </Badge>
              )}
            </div>
            
            {/* Location */}
            {(land.village || land.district) && (
              <div className="pt-3 border-t border-border/50">
                <p className="text-xs text-muted-foreground">
                  {[land.village, land.district, land.state].filter(Boolean).join(', ')}
                </p>
              </div>
            )}
            
            {/* Last Updated Footer */}
            <div className="flex items-center justify-between pt-3 border-t border-border/50">
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Clock className="h-3 w-3" />
                Last updated: {land.updated_at ? format(new Date(land.updated_at), 'MMM d, yyyy') : 'Never'}
              </p>
            </div>
          </CardContent>
        </Card>
      </motion.div>
      
      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Land</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove "{land.name}" from your lands? 
              This land will no longer appear in your list but can be recovered later if needed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? 'Removing...' : 'Remove'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}