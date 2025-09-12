import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { X, Image, Hash, Users } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';

interface CreatePostProps {
  onClose: () => void;
  onPostCreated: () => void;
}

interface Community {
  id: string;
  name: string;
}

export function CreatePost({ onClose, onPostCreated }: CreatePostProps) {
  const { toast } = useToast();
  const [content, setContent] = useState('');
  const [selectedCommunity, setSelectedCommunity] = useState('');
  const [hashtags, setHashtags] = useState('');
  const [loading, setLoading] = useState(false);
  const [communities, setCommunities] = useState<Community[]>([]);
  const [farmerId, setFarmerId] = useState<string | null>(null);

  useEffect(() => {
    // Get farmer ID from session
    const session = localStorage.getItem('farmSession');
    if (session) {
      const sessionData = JSON.parse(session);
      setFarmerId(sessionData.farmerId);
      fetchCommunities(sessionData.farmerId);
    }
  }, []);

  const fetchCommunities = async (farmerId: string) => {
    try {
      // Fetch user's joined communities
      const { data } = await supabase
        .from('community_members')
        .select('community:communities(id, name)')
        .eq('farmer_id', farmerId);
      
      if (data) {
        const comms = data
          .filter(item => item.community)
          .map(item => item.community as unknown as Community);
        setCommunities(comms);
      }
    } catch (error) {
      console.error('Error fetching communities:', error);
    }
  };

  const handleSubmit = async () => {
    if (!content.trim() || !farmerId) {
      toast({
        title: "Error",
        description: "Please write something to post",
        variant: "destructive"
      });
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.from('social_posts').insert({
        farmer_id: farmerId,
        community_id: selectedCommunity || null,
        content,
        hashtags: hashtags.split(' ').filter(tag => tag.startsWith('#')).map(tag => tag.slice(1)),
        post_type: 'text',
        created_at: new Date().toISOString()
      });

      if (error) throw error;

      toast({
        title: "Success",
        description: "Your post has been shared!",
      });
      onPostCreated();
    } catch (error: any) {
      console.error('Error creating post:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to create post",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            Create Post
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {/* Community Selection */}
          {communities.length > 0 && (
            <div className="space-y-2">
              <Label htmlFor="community">Select Community (optional)</Label>
              <Select value={selectedCommunity} onValueChange={setSelectedCommunity}>
                <SelectTrigger id="community">
                  <SelectValue placeholder="Choose a community..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">No community (Public post)</SelectItem>
                  {communities.map((community) => (
                    <SelectItem key={community.id} value={community.id}>
                      {community.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Post Content */}
          <div className="space-y-2">
            <Label htmlFor="content">What's on your mind?</Label>
            <Textarea
              id="content"
              placeholder="Share your thoughts, tips, or questions with the farming community..."
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={5}
              className="resize-none"
            />
          </div>

          {/* Hashtags */}
          <div className="space-y-2">
            <Label htmlFor="hashtags" className="flex items-center gap-2">
              <Hash className="h-4 w-4" />
              Hashtags
            </Label>
            <Input
              id="hashtags"
              placeholder="#farming #organic #tips"
              value={hashtags}
              onChange={(e) => setHashtags(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Separate hashtags with spaces
            </p>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose} disabled={loading}>
              <X className="h-4 w-4 mr-2" />
              Cancel
            </Button>
            <Button 
              onClick={handleSubmit} 
              disabled={loading || !content.trim()}
              className="min-w-[100px]"
            >
              {loading ? "Posting..." : "Post"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}