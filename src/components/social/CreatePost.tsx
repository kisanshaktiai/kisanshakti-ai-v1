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
    // Get farmer ID from auth storage
    const authStorage = localStorage.getItem('auth-storage');
    if (authStorage) {
      const authData = JSON.parse(authStorage);
      const sessionData = authData?.state?.session;
      if (sessionData?.farmerId) {
        setFarmerId(sessionData.farmerId);
        fetchCommunities(sessionData.farmerId);
      }
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
      <DialogContent className="sm:max-w-[500px] bg-card/95 backdrop-blur-xl border-border/50">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center">
              <Users className="h-5 w-5 text-primary" />
            </div>
            <span className="text-lg font-semibold text-foreground">Create Post</span>
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {/* Community Selection */}
          {communities.length > 0 && (
            <div className="space-y-2">
              <Label htmlFor="community" className="text-sm font-medium text-foreground">
                Select Community (optional)
              </Label>
              <Select value={selectedCommunity} onValueChange={setSelectedCommunity}>
                <SelectTrigger id="community" className="bg-muted/50 border-border/50 focus:border-primary/50">
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
            <Label htmlFor="content" className="text-sm font-medium text-foreground">
              What's on your mind?
            </Label>
            <Textarea
              id="content"
              placeholder="Share your thoughts, tips, or questions with the farming community..."
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={5}
              className="resize-none bg-muted/50 border-border/50 focus:border-primary/50 transition-all"
            />
          </div>

          {/* Modern Hashtags */}
          <div className="space-y-2">
            <Label htmlFor="hashtags" className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Hash className="h-4 w-4 text-primary" />
              Hashtags
            </Label>
            <Input
              id="hashtags"
              placeholder="#farming #organic #tips"
              value={hashtags}
              onChange={(e) => setHashtags(e.target.value)}
              className="bg-muted/50 border-border/50 focus:border-primary/50 transition-all"
            />
            <p className="text-xs text-muted-foreground">
              Separate hashtags with spaces
            </p>
          </div>

          {/* Modern Actions */}
          <div className="flex justify-between items-center">
            <div className="flex gap-2">
              <Button variant="ghost" size="icon" className="hover:bg-primary/10">
                <Image className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex gap-2">
              <Button 
                variant="outline" 
                onClick={onClose} 
                disabled={loading}
                className="border-border/50 hover:bg-muted/50"
              >
                Cancel
              </Button>
              <Button 
                onClick={handleSubmit} 
                disabled={loading || !content.trim()}
                className="bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/25"
              >
                {loading ? "Posting..." : "Share Post"}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}