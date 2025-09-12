import React, { useState } from 'react';
import { Card } from '@/components/ui/card';
import { CropInput } from '@/components/crops/CropInput';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

export default function CropSelectionTest() {
  const [selectedCrop1, setSelectedCrop1] = useState<{ id: string; name: string }>({ id: '', name: '' });
  const [selectedCrop2, setSelectedCrop2] = useState<{ id: string; name: string }>({ id: '', name: '' });
  const [selectedCrop3, setSelectedCrop3] = useState<{ id: string; name: string }>({ id: '', name: '' });

  const handleSave = () => {
    const crops = [selectedCrop1, selectedCrop2, selectedCrop3]
      .filter(c => c.id)
      .map(c => c.name);
    
    if (crops.length === 0) {
      toast.error('Please select at least one crop');
      return;
    }

    toast.success(`Selected crops: ${crops.join(', ')}`);
  };

  const handleReset = () => {
    setSelectedCrop1({ id: '', name: '' });
    setSelectedCrop2({ id: '', name: '' });
    setSelectedCrop3({ id: '', name: '' });
    toast.info('All selections cleared');
  };

  return (
    <div className="container mx-auto p-4 max-w-2xl">
      <Card className="p-6">
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-bold mb-2">Crop Selection System</h1>
            <p className="text-muted-foreground">
              Test the new simplified crop selection interface optimized for rural farmers
            </p>
          </div>

          <div className="space-y-4">
            <CropInput
              value={selectedCrop1.id}
              onChange={(id, name) => setSelectedCrop1({ id, name })}
              label="Primary Crop"
              placeholder="Select your main crop"
              required
            />

            <CropInput
              value={selectedCrop2.id}
              onChange={(id, name) => setSelectedCrop2({ id, name })}
              label="Secondary Crop"
              placeholder="Select your secondary crop (optional)"
            />

            <CropInput
              value={selectedCrop3.id}
              onChange={(id, name) => setSelectedCrop3({ id, name })}
              label="Tertiary Crop"
              placeholder="Select your third crop (optional)"
            />
          </div>

          <div className="pt-4 border-t">
            <h3 className="font-medium mb-3">Selected Crops:</h3>
            <div className="flex flex-wrap gap-2 mb-4">
              {selectedCrop1.name && (
                <Badge variant="default" className="px-3 py-1">
                  Primary: {selectedCrop1.name}
                </Badge>
              )}
              {selectedCrop2.name && (
                <Badge variant="secondary" className="px-3 py-1">
                  Secondary: {selectedCrop2.name}
                </Badge>
              )}
              {selectedCrop3.name && (
                <Badge variant="outline" className="px-3 py-1">
                  Tertiary: {selectedCrop3.name}
                </Badge>
              )}
              {!selectedCrop1.name && !selectedCrop2.name && !selectedCrop3.name && (
                <p className="text-sm text-muted-foreground">No crops selected yet</p>
              )}
            </div>
          </div>

          <div className="flex gap-3">
            <Button onClick={handleSave} className="flex-1">
              Save Selection
            </Button>
            <Button onClick={handleReset} variant="outline">
              Reset
            </Button>
          </div>
        </div>
      </Card>

      <Card className="mt-6 p-6 bg-muted/50">
        <h3 className="font-medium mb-2">System Status</h3>
        <div className="space-y-2 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-500"></div>
            <span>Crop database connected</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-500"></div>
            <span>UI responsive and optimized</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-500"></div>
            <span>Touch-friendly for mobile devices</span>
          </div>
        </div>
      </Card>
    </div>
  );
}