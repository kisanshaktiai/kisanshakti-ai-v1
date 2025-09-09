import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Loader2 } from 'lucide-react';

const formSchema = z.object({
  local_name: z.string().min(2, 'Farm name must be at least 2 characters'),
  gat_number: z.string().optional(),
  ownership_type: z.enum(['owned', 'leased', 'shared']),
  soil_type: z.string().optional(),
  water_source: z.string().optional(),
  notes: z.string().optional(),
});

type FormData = z.infer<typeof formSchema>;

interface LandFormDialogProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: FormData) => Promise<void>;
  area: {
    sqft: number;
    guntha: number;
    acres: number;
  };
}

export function LandFormDialog({ open, onClose, onSubmit, area }: LandFormDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      local_name: '',
      gat_number: '',
      ownership_type: 'owned',
      soil_type: '',
      water_source: '',
      notes: '',
    },
  });

  const handleSubmit = async (data: FormData) => {
    setIsSubmitting(true);
    try {
      await onSubmit(data);
      form.reset();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Complete Land Details</DialogTitle>
          <DialogDescription>
            Add details for your {area.acres.toFixed(3)} acre land
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-3 gap-2 p-3 bg-muted rounded-lg">
          <div className="text-center">
            <div className="text-sm font-medium">{area.sqft.toLocaleString()}</div>
            <div className="text-xs text-muted-foreground">sq ft</div>
          </div>
          <div className="text-center">
            <div className="text-sm font-medium">{area.guntha.toFixed(2)}</div>
            <div className="text-xs text-muted-foreground">guntha</div>
          </div>
          <div className="text-center">
            <div className="text-sm font-medium">{area.acres.toFixed(3)}</div>
            <div className="text-xs text-muted-foreground">acres</div>
          </div>
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="local_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Farm Local Name *</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., North Field" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="gat_number"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Gat/Survey Number</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., 123/A" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="ownership_type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Ownership Type *</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select ownership type" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="owned">Owned</SelectItem>
                      <SelectItem value="leased">Leased</SelectItem>
                      <SelectItem value="shared">Shared</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="soil_type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Soil Type</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., Black cotton soil" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="water_source"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Water Source</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., Well, Canal" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Additional Notes</FormLabel>
                  <FormControl>
                    <Textarea 
                      placeholder="Any additional information about the land"
                      className="resize-none"
                      {...field} 
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex gap-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                className="flex-1"
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button type="submit" className="flex-1" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save Land
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}