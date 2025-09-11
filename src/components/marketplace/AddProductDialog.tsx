import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface AddProductDialogProps {
  open: boolean;
  onClose: () => void;
  sellerId: string;
  onSuccess: () => void;
}

export function AddProductDialog({ open, onClose, onSuccess }: AddProductDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add New Product</DialogTitle>
        </DialogHeader>
        <div className="py-4">
          <p className="text-muted-foreground">Product creation form will be implemented here</p>
        </div>
        <Button onClick={onClose}>Close</Button>
      </DialogContent>
    </Dialog>
  );
}