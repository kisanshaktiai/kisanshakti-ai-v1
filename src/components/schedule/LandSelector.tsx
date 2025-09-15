import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { 
  MapPin, 
  Droplets, 
  Mountain, 
  Sprout, 
  Trees, 
  MoreVertical,
  Plus,
  Wheat,
  TreePine,
  ChevronRight,
  Waves,
  Grid3x3
} from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

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
  soil_ph?: number;
  organic_carbon_percent?: number;
}

interface LandSelectorProps {
  lands: Land[];
  onSelectLand: (land: Land) => void;
}

const getSoilIcon = (soilType?: string) => {
  if (!soilType) return Mountain;
  const type = soilType.toLowerCase();
  if (type.includes('clay')) return Mountain;
  if (type.includes('loam')) return TreePine;
  return Mountain;
};

const getWaterIcon = (waterSource?: string) => {
  if (!waterSource) return Droplets;
  const source = waterSource.toLowerCase();
  if (source.includes('well')) return Droplets;
  if (source.includes('river') || source.includes('canal')) return Waves;
  return Droplets;
};

const getCropIcon = (crop?: string) => {
  if (!crop) return Sprout;
  const cropName = crop.toLowerCase();
  if (cropName.includes('wheat') || cropName.includes('rice')) return Wheat;
  if (cropName.includes('tree') || cropName.includes('fruit')) return Trees;
  return Sprout;
};

export default function LandSelector({ lands, onSelectLand }: LandSelectorProps) {
  const navigate = useNavigate();

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1
      }
    }
  };

  const itemVariants = {
    hidden: { y: 20, opacity: 0 },
    visible: {
      y: 0,
      opacity: 1,
      transition: {
        type: "spring" as const,
        stiffness: 100
      }
    }
  };

  return (
    <div className="relative">
      <motion.div 
        className="grid gap-6 sm:grid-cols-1 lg:grid-cols-2 xl:grid-cols-3"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        {lands.map((land) => {
          const SoilIcon = getSoilIcon(land.soil_type);
          const WaterIcon = getWaterIcon(land.water_source);
          const CropIcon = getCropIcon(land.current_crop);
          
          return (
            <motion.div key={land.id} variants={itemVariants}>
              <Card 
                className={cn(
                  "group relative overflow-hidden cursor-pointer",
                  "bg-card/80 backdrop-blur-md",
                  "border border-border/50",
                  "hover:border-primary/50",
                  "shadow-lg hover:shadow-xl",
                  "transition-all duration-300 ease-out",
                  "hover:scale-[1.02]"
                )}
                onClick={() => onSelectLand(land)}
              >
                {/* Gradient overlay on hover */}
                <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-accent/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                
                {/* Content */}
                <div className="relative p-4 space-y-3">
                  {/* Header */}
                  <div className="flex items-start justify-between">
                    <div className="space-y-0.5">
                      <h3 className="text-lg font-bold text-foreground group-hover:text-primary transition-colors">
                        {land.name}
                      </h3>
                      {land.survey_number && (
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <Grid3x3 className="h-3 w-3" />
                          Survey #{land.survey_number}
                        </p>
                      )}
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors group-hover:translate-x-1 duration-300" />
                  </div>

                  {/* Area Display */}
                  <div className="bg-gradient-to-r from-primary/10 to-accent/10 rounded-lg p-3">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 bg-background/80 rounded-md">
                        <Trees className="h-4 w-4 text-primary" />
                      </div>
                      <div>
                        <p className="text-xl font-bold text-foreground">
                          {land.area_acres} <span className="text-sm font-medium text-muted-foreground">acres</span>
                        </p>
                        {land.area_guntas && land.area_guntas > 0 && (
                          <p className="text-xs text-muted-foreground">
                            {land.area_guntas} guntas
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Location */}
                  {(land.village || land.district) && (
                    <div className="flex items-start gap-2">
                      <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
                      <div className="text-sm text-muted-foreground">
                        {land.village && <span>{land.village}</span>}
                        {land.village && land.district && ', '}
                        {land.district && <span>{land.district}</span>}
                        {land.state && (
                          <>
                            {(land.village || land.district) && ', '}
                            <span>{land.state}</span>
                          </>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Pills for attributes */}
                  <div className="flex flex-wrap gap-2">
                    {land.soil_type && (
                      <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gradient-to-r from-secondary/20 to-secondary/10 border border-secondary/20">
                        <SoilIcon className="h-3.5 w-3.5 text-secondary" />
                        <span className="text-xs font-medium text-secondary-foreground/90">
                          {land.soil_type}
                        </span>
                      </div>
                    )}
                    
                    {land.water_source && (
                      <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gradient-to-r from-info/20 to-info/10 border border-info/20">
                        <WaterIcon className="h-3.5 w-3.5 text-info" />
                        <span className="text-xs font-medium text-info-foreground/90">
                          {land.water_source}
                        </span>
                      </div>
                    )}
                    
                    {land.irrigation_type && (
                      <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gradient-to-r from-accent/20 to-accent/10 border border-accent/20">
                        <Droplets className="h-3.5 w-3.5 text-accent" />
                        <span className="text-xs font-medium text-accent-foreground/90">
                          {land.irrigation_type}
                        </span>
                      </div>
                    )}
                    
                    {land.current_crop && (
                      <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gradient-to-r from-success/20 to-success/10 border border-success/20">
                        <CropIcon className="h-3.5 w-3.5 text-success" />
                        <span className="text-xs font-medium text-success-foreground/90">
                          {land.current_crop}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            </motion.div>
          );
        })}
      </motion.div>

      {/* Add Land Button - Positioned at bottom right of last card */}
      <motion.div
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ 
          delay: (lands.length * 0.1) + 0.2,
          type: "spring",
          stiffness: 200,
          damping: 15
        }}
        className="flex justify-end mt-4 mb-4 pr-4"
      >
        <button
          onClick={() => navigate('/app/lands/add')}
          className={cn(
            "group relative",
            "flex items-center justify-center",
            "h-14 w-14",
            "rounded-2xl",
            "bg-gradient-to-br from-success/90 to-success",
            "hover:from-success hover:to-success/90",
            "shadow-lg hover:shadow-xl hover:shadow-success/20",
            "transition-all duration-300",
            "hover:scale-105 active:scale-95",
            "border border-success/20"
          )}
        >
          <Plus className="h-6 w-6 text-white transition-transform duration-300 group-hover:rotate-90" />
          
          {/* Ripple effect on hover */}
          <div className="absolute inset-0 rounded-2xl bg-white/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
        </button>
      </motion.div>
    </div>
  );
}