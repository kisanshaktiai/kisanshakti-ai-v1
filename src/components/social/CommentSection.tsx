import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuthStore } from '@/stores/authStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { formatDistanceToNow } from 'date-fns';
import { Send } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface CommentSectionProps {
  postId: string;
  comments: any[];
}

export function CommentSection({ postId, comments: initialComments }: CommentSectionProps) {
  const { user } = useAuthStore();
  const { toast } = useToast();
  const [comments, setComments] = useState(initialComments);
  const [newComment, setNewComment] = useState('');
  const [loading, setLoading] = useState(false);

  const handleAddComment = async () => {
    if (!newComment.trim() || !user?.id) return;

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('post_comments')
        .insert({
          post_id: postId,
          farmer_id: user.id,
          content: newComment
        })
        .select(`
          *,
          farmer:farmers!post_comments_farmer_id_fkey(
            farmer_name
          )
        `)
        .single();

      if (error) throw error;

      setComments([...comments, data]);
      setNewComment('');

      // Update comment count
      await supabase
        .from('social_posts')
        .update({ comments_count: comments.length + 1 })
        .eq('id', postId);

      toast({
        title: "Comment added",
        description: "Your comment has been posted."
      });
    } catch (error) {
      console.error('Error adding comment:', error);
      toast({
        title: "Error",
        description: "Failed to add comment. Please try again.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mt-4 pt-4 border-t">
      {/* Comment Input */}
      <div className="flex gap-2 mb-4">
        <Input
          placeholder="Add a comment..."
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && handleAddComment()}
          disabled={loading}
        />
        <Button size="sm" onClick={handleAddComment} disabled={loading || !newComment.trim()}>
          <Send className="w-4 h-4" />
        </Button>
      </div>

      {/* Comments List */}
      <div className="space-y-3">
        {comments.map((comment) => (
          <div key={comment.id} className="flex gap-2">
            <Avatar className="w-8 h-8">
              <AvatarFallback className="text-xs">
                {comment.farmer?.farmer_name?.[0] || 'F'}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <div className="bg-muted p-2 rounded-lg">
                <p className="text-sm font-medium">{comment.farmer?.farmer_name || 'Farmer'}</p>
                <p className="text-sm">{comment.content}</p>
              </div>
              <span className="text-xs text-muted-foreground ml-2">
                {formatDistanceToNow(new Date(comment.created_at), { addSuffix: true })}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}