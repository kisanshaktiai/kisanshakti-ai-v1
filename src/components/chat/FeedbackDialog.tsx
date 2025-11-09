import React, { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ThumbsUp, ThumbsDown, Send } from 'lucide-react';
import { motion } from 'framer-motion';

interface FeedbackDialogProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (feedback: 'positive' | 'negative', comment?: string) => void;
  feedbackType: 'positive' | 'negative' | null;
  messageContent: string;
}

export function FeedbackDialog({ 
  open, 
  onClose, 
  onSubmit, 
  feedbackType,
  messageContent 
}: FeedbackDialogProps) {
  const [comment, setComment] = useState('');

  const handleSubmit = () => {
    if (feedbackType) {
      onSubmit(feedbackType, comment.trim() || undefined);
      setComment('');
      onClose();
    }
  };

  const handleSkip = () => {
    if (feedbackType) {
      onSubmit(feedbackType);
      setComment('');
      onClose();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {feedbackType === 'positive' ? (
              <>
                <ThumbsUp className="w-5 h-5 text-green-500" />
                <span>Thank you for your positive feedback!</span>
              </>
            ) : (
              <>
                <ThumbsDown className="w-5 h-5 text-red-500" />
                <span>Help us improve</span>
              </>
            )}
          </DialogTitle>
          <DialogDescription>
            {feedbackType === 'positive' 
              ? "What made this response helpful? (Optional)" 
              : "What could we do better? (Optional)"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Message Preview */}
          <div className="p-3 bg-muted rounded-lg max-h-32 overflow-y-auto">
            <p className="text-sm text-muted-foreground line-clamp-4">
              {messageContent}
            </p>
          </div>

          {/* Feedback Text Input */}
          <div className="space-y-2">
            <Textarea
              placeholder={
                feedbackType === 'positive'
                  ? "e.g., The advice was practical and easy to follow..."
                  : "e.g., I need more specific measurements..."
              }
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={4}
              className="resize-none"
            />
            <p className="text-xs text-muted-foreground">
              Your feedback helps train our AI to provide better agricultural advice.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2 justify-end">
            <Button
              variant="ghost"
              onClick={handleSkip}
            >
              Skip
            </Button>
            <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
              <Button
                onClick={handleSubmit}
                className={
                  feedbackType === 'positive'
                    ? "bg-green-600 hover:bg-green-700"
                    : "bg-blue-600 hover:bg-blue-700"
                }
              >
                <Send className="w-4 h-4 mr-2" />
                Submit Feedback
              </Button>
            </motion.div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
