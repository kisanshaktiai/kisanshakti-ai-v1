import React, { useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Send } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { usePostComments, useCreateComment } from '@/hooks/useCommunityComments';
import { useTranslation } from 'react-i18next';

interface CommentsSheetProps {
  postId: string | null;
  isOpen: boolean;
  onClose: () => void;
}

export const CommentsSheet: React.FC<CommentsSheetProps> = ({ postId, isOpen, onClose }) => {
  const { t } = useTranslation();
  const [draft, setDraft] = useState('');
  const { data: comments = [], isLoading } = usePostComments(isOpen ? postId : null);
  const createComment = useCreateComment();

  const handleSend = () => {
    if (!postId || !draft.trim()) return;
    createComment.mutate(
      { postId, content: draft },
      { onSuccess: () => setDraft('') },
    );
  };

  return (
    <Sheet open={isOpen} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="bottom" className="h-[80vh] flex flex-col p-0 rounded-t-3xl">
        <SheetHeader className="px-4 py-3 border-b">
          <SheetTitle>{t('social.comments.title') || 'Comments'}</SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : comments.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-12">
              {t('social.comments.empty') || 'Be the first to comment'}
            </p>
          ) : (
            comments.map((c) => (
              <div key={c.id} className="flex gap-3">
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center text-lg flex-shrink-0">
                  👨‍🌾
                </div>
                <div className="flex-1 bg-muted/40 rounded-2xl px-3 py-2">
                  <div className="flex items-baseline gap-2 mb-0.5">
                    <span className="text-sm font-semibold text-foreground">
                      {c.farmer?.farmer_name || 'Farmer'}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {c.created_at ? formatDistanceToNow(new Date(c.created_at), { addSuffix: true }) : ''}
                    </span>
                  </div>
                  <p className="text-sm text-foreground whitespace-pre-wrap">{c.content}</p>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="border-t p-3 flex items-end gap-2 bg-background">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={t('social.comments.placeholder') || 'Write a comment…'}
            rows={1}
            className="resize-none min-h-[44px] rounded-2xl"
          />
          <Button
            onClick={handleSend}
            disabled={!draft.trim() || createComment.isPending}
            size="icon"
            className="rounded-full h-11 w-11 flex-shrink-0"
          >
            {createComment.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
};
