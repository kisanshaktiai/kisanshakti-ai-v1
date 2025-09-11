import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuthStore } from '@/stores/authStore';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { X, Image, Hash } from 'lucide-react';
import { Input } from '@/components/ui/input';

interface CreatePostProps {
  onClose: () => void;
  onPostCreated: () => void;
}

export function CreatePost({ onClose, onPostCreated }: CreatePostProps) {
  const { user } = useAuthStore();
  const [content, setContent] = useState('');
  const [selectedCommunity, setSelectedCommunity] = useState('');
  const [hashtags, setHashtags] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!content.trim() || !user?.id) return;

    setLoading(true);
    try {
      await supabase.from('social_posts').insert({
        farmer_id: user.id,
        community_id: selectedCommunity || null,
        content,
        hashtags: hashtags.split(' ').filter(tag => tag.startsWith('#')).map(tag => tag.slice(1)),
        post_type: 'text'
      });
      onPostCreated();
    } catch (error) {
      console.error('Error creating post:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Post</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <Textarea
            placeholder="What's on your mind?"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={4}
          />
          <Input
            placeholder="Add hashtags #farming #organic"
            value={hashtags}
            onChange={(e) => setHashtags(e.target.value)}
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={loading || !content.trim()}>
              Post
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}