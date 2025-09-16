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
  Clock,
  Share2,
  Copy,
  Eye,
  Satellite,
  Activity,
  Percent
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
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

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
  const [imageLoading, setImageLoading] = useState(true);
  const { apiKey } = useGoogleMapsApi();
  
  // Generate static map URL with boundary polygon
  const getStaticMapUrl = () => {
    if (!apiKey) {
      return '/placeholder.svg';
    }
    
    try {
      // Mobile optimized - smaller image size for faster loading
      const isMobile = window.innerWidth < 640;
      const imageSize = isMobile ? '400x200' : '600x300';
      
      if (!land.boundary_polygon_old || !land.boundary_polygon_old.coordinates) {
        if (land.center_point_old?.coordinates) {
          const center = `${land.center_point_old.coordinates[1]},${land.center_point_old.coordinates[0]}`;
          return `https://maps.googleapis.com/maps/api/staticmap?` +
            `center=${center}` +
            `&zoom=16` +
            `&size=${imageSize}` +
            `&maptype=satellite` +
            `&style=feature:all|element:labels|visibility:off` +
            `&style=feature:poi|visibility:off` +
            `&style=feature:road|visibility:off` +
            `&markers=color:green|size:medium|${center}` +
            `&key=${apiKey}`;
        }
        return '/placeholder.svg';
      }
      
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
      
      const latDiff = maxLat - minLat;
      const lngDiff = maxLng - minLng;
      const paddingFactor = 0.25;
      const minBoundSize = 0.0005;
      const effectiveLatDiff = Math.max(latDiff, minBoundSize);
      const effectiveLngDiff = Math.max(lngDiff, minBoundSize);
      
      const paddedMinLat = minLat - (effectiveLatDiff * paddingFactor);
      const paddedMaxLat = maxLat + (effectiveLatDiff * paddingFactor);
      const paddedMinLng = minLng - (effectiveLngDiff * paddingFactor);
      const paddedMaxLng = maxLng + (effectiveLngDiff * paddingFactor);
      
      const visibleBounds = `${paddedMinLat},${paddedMinLng}|${paddedMaxLat},${paddedMaxLng}`;
      
      const path = coordinates
        .map((coord: number[]) => `${coord[1]},${coord[0]}`)
        .join('|');
      
      return `https://maps.googleapis.com/maps/api/staticmap?` +
        `visible=${visibleBounds}` +
        `&size=${imageSize}` +
        `&maptype=satellite` +
        `&style=feature:all|element:labels|visibility:off` +
        `&style=feature:poi|visibility:off` +
        `&style=feature:road|visibility:off` +
        `&path=color:0xffffff|weight:3|${path}` +
        `&path=color:0x00ff00|weight:2|fillcolor:0x00ff0033|${path}` +
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
  
  const handleShare = () => {
    if (navigator.share) {
      navigator.share({
        title: land.name,
        text: `Check out my land parcel: ${land.name}`,
        url: window.location.href,
      });
    } else {
      navigator.clipboard.writeText(window.location.href);
      toast({
        title: 'Link Copied',
        description: 'Land link copied to clipboard',
      });
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
        className="h-full"
      >
        <Card className="overflow-hidden cursor-pointer group relative bg-card hover:shadow-2xl transition-all duration-300 border-border/50 h-full flex flex-col">
          {/* Map Image Section */}
          <div className="relative h-40 sm:h-48 overflow-hidden bg-muted">
            <div className="absolute inset-0 bg-gradient-to-t from-background/80 via-transparent to-transparent z-10" />
            
            {imageLoading && (
              <Skeleton className="absolute inset-0" />
            )}
            
            <img 
              src={mapUrl} 
              alt={`${land.name} boundary`}
              className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
              loading="lazy"
              onLoad={() => setImageLoading(false)}
              onError={() => setImageLoading(false)}
            />
            
            {/* Direct Action Icons */}
            <div className="absolute top-2 right-2 flex gap-1 z-20">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="icon"
                      variant="secondary"
                      className="h-8 w-8 bg-background/90 backdrop-blur hover:bg-background shadow-lg"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleEdit();
                      }}
                    >
                      <Edit3 className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Edit</TooltipContent>
                </Tooltip>
              </TooltipProvider>
              
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="icon"
                      variant="secondary"
                      className="h-8 w-8 bg-background/90 backdrop-blur hover:bg-background shadow-lg"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteDialogOpen(true);
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Delete</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            
            {/* Utilized Percentage Badge */}
            <Badge className="absolute top-2 left-2 bg-primary/90 backdrop-blur text-primary-foreground border-primary/20 z-20 text-xs sm:text-sm">
              <Percent className="h-3 w-3 mr-1" />
              {land.current_crop ? '85% Utilized' : '0% Utilized'}
            </Badge>
            
            {/* Area Badge */}
            <Badge className="absolute bottom-2 left-2 bg-background/90 backdrop-blur border-primary/20 z-20 text-xs sm:text-sm">
              <Mountain className="h-3 w-3 mr-1" />
              {formatArea()}
            </Badge>
          </div>
          
          {/* Content Section */}
          <CardContent 
            className="p-3 sm:p-4 space-y-3 flex-1 flex flex-col"
            onClick={() => navigate(`/app/lands/${land.id}`)}
          >
            {/* Land Name and Survey Number */}
            <div className="space-y-1">
              <h3 className="font-bold text-base sm:text-lg tracking-tight flex items-center gap-1 line-clamp-1">
                {land.name}
                <ChevronRight className="h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
              </h3>
              {land.survey_number && (
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  Survey No: {land.survey_number}
                </p>
              )}
            </div>
            
            {/* Crop Information - Mobile optimized */}
            {(land.current_crop || land.previous_crop) && (
              <div className="grid grid-cols-2 gap-2">
                {land.current_crop && (
                  <div className="space-y-0.5">
                    <p className="text-xs text-muted-foreground">Current</p>
                    <div className="flex items-center gap-1">
                      <Wheat className="h-3 w-3 sm:h-4 sm:w-4 text-primary flex-shrink-0" />
                      <span className="text-xs sm:text-sm font-medium truncate">{land.current_crop}</span>
                    </div>
                  </div>
                )}
                
                {land.previous_crop && (
                  <div className="space-y-0.5">
                    <p className="text-xs text-muted-foreground">Previous</p>
                    <div className="flex items-center gap-1">
                      <TreePine className="h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground flex-shrink-0" />
                      <span className="text-xs sm:text-sm truncate">{land.previous_crop}</span>
                    </div>
                  </div>
                )}
              </div>
            )}
            
            {/* Smart Action Buttons */}
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="flex-1 h-8 text-xs font-medium"
                onClick={(e) => {
                  e.stopPropagation();
                  navigate(`/app/lands/${land.id}/soil`);
                }}
              >
                <Activity className="h-3 w-3 mr-1" />
                Soil Health
              </Button>
              
              <Button
                variant="outline"
                size="sm"
                className="flex-1 h-8 text-xs font-medium"
                onClick={(e) => {
                  e.stopPropagation();
                  navigate(`/app/lands/${land.id}/ndvi`);
                }}
              >
                <Satellite className="h-3 w-3 mr-1" />
                NDVI Data
              </Button>
            </div>
            
            {/* Land Details Tags */}
            <div className="flex flex-wrap gap-1.5">
              {land.irrigation_type && (
                <Badge variant="secondary" className="text-xs px-2 py-0.5">
                  <Droplets className="h-2.5 w-2.5 mr-1" />
                  {land.irrigation_type.replace('_', ' ')}
                </Badge>
              )}
              
              {land.soil_type && (
                <Badge variant="outline" className="text-xs px-2 py-0.5">
                  <Globe className="h-2.5 w-2.5 mr-1" />
                  {land.soil_type.replace('_', ' ')}
                </Badge>
              )}
              
              {land.ownership_type && (
                <Badge variant="outline" className="text-xs px-2 py-0.5">
                  {land.ownership_type}
                </Badge>
              )}
            </div>
            
            {/* Location Footer */}
            {(land.village || land.district) && (
              <div className="pt-2 border-t border-border/50">
                <p className="text-xs text-muted-foreground truncate">
                  {[land.village, land.district, land.state].filter(Boolean).join(', ')}
                </p>
                <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                  <Clock className="h-2.5 w-2.5" />
                  Updated: {land.updated_at ? format(new Date(land.updated_at), 'MMM d') : 'Never'}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>
      
      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="max-w-[90vw] sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Land</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove "{land.name}" from your lands? 
              This land will no longer appear in your list but can be recovered later if needed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col-reverse sm:flex-row gap-2 sm:gap-0">
            <AlertDialogCancel className="w-full sm:w-auto">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="w-full sm:w-auto bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? 'Removing...' : 'Remove'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}