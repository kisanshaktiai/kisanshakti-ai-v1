import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { SimpleCropSelector } from './SimpleCropSelector';

interface CropSelectorModalProps {
  open: boolean;
  onClose: () => void;
  onSelect: (cropId: string, cropName: string) => void;
  selectedCropId?: string;
  title?: string;
  description?: string;
}

export function CropSelectorModal({
  open,
  onClose,
  onSelect,
  selectedCropId,
  title = "Select Crop",
  description = "Choose a crop from the categories below"
}: CropSelectorModalProps) {
  
  const handleSelect = (cropId: string, cropName: string) => {
    onSelect(cropId, cropName);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg max-h-[80vh] p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        
        <div className="flex-1 overflow-auto">
          <SimpleCropSelector
            selectedCropId={selectedCropId}
            onSelect={handleSelect}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}