import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { ChevronDown, X, Wheat } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { EnhancedCropSelector } from './EnhancedCropSelector';

interface SmartCropInputProps {
  value?: string;
  onChange: (cropId: string, cropName: string, localName?: string) => void;
  label?: string;
  placeholder?: string;
  required?: boolean;
  className?: string;
  error?: string;
}

export function SmartCropInput({
  value,
  onChange,
  label,
  placeholder = "Select a crop",
  required = false,
  className,
  error
}: SmartCropInputProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [cropName, setCropName] = useState<string>('');
  const [localName, setLocalName] = useState<string>('');
  const [cropIcon, setCropIcon] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Fetch crop details when value changes
  useEffect(() => {
    const fetchCropDetails = async (cropId: string) => {
      if (!cropId) {
        setCropName('');
        setLocalName('');
        setCropIcon(null);
        return;
      }

      setIsLoading(true);
      try {
        const { data, error } = await supabase
          .from('crops')
          .select('label, icon')
          .eq('id', cropId)
          .single();

        if (error) throw error;

        if (data) {
          setCropName(data.label);
          setLocalName(''); // local_name will be handled separately
          setCropIcon(data.icon);
        }
      } catch (err) {
        console.error('Error fetching crop details:', err);
        // Try to get from value if it's a crop name
        setCropName(cropId);
      } finally {
        setIsLoading(false);
      }
    };

    if (value) {
      fetchCropDetails(value);
    } else {
      setCropName('');
      setLocalName('');
      setCropIcon(null);
    }
  }, [value]);

  const handleSelect = (cropId: string, cropName: string, localName?: string) => {
    onChange(cropId, cropName, localName);
    setIsOpen(false);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange('', '', '');
  };

  return (
    <>
      {label && (
        <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
          {label}
          {required && <span className="text-destructive ml-1">*</span>}
        </label>
      )}
      
      <div className={cn("relative", className)}>
        <Button
          type="button"
          variant="outline"
          onClick={() => setIsOpen(true)}
          className={cn(
            "w-full justify-between h-10",
            !cropName && "text-muted-foreground",
            error && "border-destructive"
          )}
          disabled={isLoading}
        >
          <div className="flex items-center gap-2 flex-1 text-left">
            {cropIcon ? (
              <img 
                src={cropIcon} 
                alt="" 
                className="h-5 w-5 object-contain"
              />
            ) : (
              <Wheat className="h-4 w-4" />
            )}
            <div className="flex-1">
              {cropName ? (
                <div>
                  <span className="block truncate">{cropName}</span>
                  {localName && (
                    <span className="text-xs text-muted-foreground block truncate">
                      {localName}
                    </span>
                  )}
                </div>
              ) : (
                <span>{placeholder}</span>
              )}
            </div>
          </div>
          
          <div className="flex items-center gap-1">
            {cropName && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0"
                onClick={handleClear}
              >
                <X className="h-3 w-3" />
              </Button>
            )}
            <ChevronDown className="h-4 w-4 opacity-50" />
          </div>
        </Button>
        
        {error && (
          <p className="text-xs text-destructive mt-1">{error}</p>
        )}
      </div>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="sm:max-w-xl max-h-[80vh] p-0 overflow-hidden">
          <DialogHeader className="px-6 pt-6">
            <DialogTitle>Select Crop</DialogTitle>
            <DialogDescription>
              Search or browse crops by category. Popular crops are shown first.
            </DialogDescription>
          </DialogHeader>
          
          <div className="flex-1 overflow-hidden">
            <EnhancedCropSelector
              selectedCropId={value}
              onSelect={handleSelect}
            />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}