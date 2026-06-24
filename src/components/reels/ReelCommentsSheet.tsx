import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { useAuthStore } from '@/stores/authStore';
import { useTranslation } from 'react-i18next';
import { Loader2, Send } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface ReelCommentsSheetProps {
  reelId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface CommentRow {
  id: string;
  body: string;
  created_at: string;
  farmer_id: string;
}

export function ReelCommentsSheet({ reelId, open, onOpenChange }: ReelCommentsSheetProps) {
  const { t } = useTranslation();
  const { session } = useAuthStore();
  const farmerId = session?.farmerId;
  const { toast } = useToast();

  const [comments, setComments] = useState<CommentRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState('');
  const [posting, setPosting] = useState(false);

  useEffect(() => {
    if (!open || !reelId) return;
    let cancelled = false;
    setLoading(true);
    supabase
      .from('reels_comments')
      .select('id, body, created_at, farmer_id')
      .eq('reel_id', reelId)
      .eq('is_hidden', false)
      .order('created_at', { ascending: false })
      .limit(100)
      .then(({ data }) => {
        if (cancelled) return;
        setComments((data || []) as CommentRow[]);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, reelId]);

  const post = async () => {
    if (!reelId || !farmerId || !text.trim()) return;
    setPosting(true);
    const { data, error } = await supabase
      .from('reels_comments')
      .insert({ reel_id: reelId, farmer_id: farmerId, body: text.trim() })
      .select('id, body, created_at, farmer_id')
      .single();
    setPosting(false);
    if (error) {
      toast({ description: t('reels.comment.failed', 'Could not post comment'), variant: 'destructive' });
      return;
    }
    setComments((c) => [data as CommentRow, ...c]);
    setText('');
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-2xl h-[80vh] flex flex-col p-0 bg-background">
        <SheetHeader className="px-4 py-3 border-b">
          <SheetTitle>{t('reels.comments.title', 'Comments')}</SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : comments.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-10">
              {t('reels.comments.empty', 'Be the first to comment')}
            </p>
          ) : (
            comments.map((c) => (
              <div key={c.id} className="flex gap-3">
                <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center text-sm font-semibold text-muted-foreground shrink-0">
                  {c.farmer_id.slice(0, 1).toUpperCase()}
                </div>
                <div className="flex-1">
                  <p className="text-sm text-foreground whitespace-pre-wrap break-words">{c.body}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {new Date(c.created_at).toLocaleString()}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="border-t p-3 flex gap-2 items-end pb-[env(safe-area-inset-bottom,12px)]">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={t('reels.comments.placeholder', 'Write a comment…')}
            className="min-h-[44px] max-h-32 resize-none"
            maxLength={1000}
          />
          <Button onClick={post} disabled={!text.trim() || posting} size="icon" className="h-11 w-11 shrink-0">
            {posting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
