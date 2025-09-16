import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { X, Image, Hash, Users, Globe, Lock, Sparkles, Camera, BarChart3 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

interface CreatePostProps {
  onClose: () => void;
  onPostCreated: () => void;
}

interface Community {
  id: string;
  name: string;
  is_global?: boolean;
}

export function CreatePost({ onClose, onPostCreated }: CreatePostProps) {
  const { toast } = useToast();
  const [content, setContent] = useState('');
  const [selectedCommunity, setSelectedCommunity] = useState<string | null>(null);
  const [postScope, setPostScope] = useState<'global' | 'tenant'>('tenant');
  const [hashtags, setHashtags] = useState('');
  const [loading, setLoading] = useState(false);
  const [communities, setCommunities] = useState<Community[]>([]);
  const [farmerId, setFarmerId] = useState<string | null>(null);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [characterCount, setCharacterCount] = useState(0);
  const maxCharacters = 500;

  useEffect(() => {
    // Get farmer ID and tenant ID from auth storage
    const authStorage = localStorage.getItem('auth-storage');
    if (authStorage) {
      const authData = JSON.parse(authStorage);
      const sessionData = authData?.state?.session;
      if (sessionData?.farmerId) {
        setFarmerId(sessionData.farmerId);
        setTenantId(sessionData.tenantId);
        fetchCommunities(sessionData.farmerId);
      }
    }
  }, []);

  const fetchCommunities = async (farmerId: string) => {
    try {
      // Fetch user's joined communities
      const { data } = await supabase
        .from('community_members')
        .select('community:communities(id, name, is_global)')
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
      const postData: any = {
        farmer_id: farmerId,
        community_id: selectedCommunity,
        content,
        hashtags: hashtags.split(' ').filter(tag => tag.startsWith('#')).map(tag => tag.slice(1)),
        post_type: 'text',
        created_at: new Date().toISOString()
      };

      // Set tenant_id based on scope
      if (postScope === 'global') {
        postData.tenant_id = null; // Global post
      } else {
        postData.tenant_id = tenantId; // Organization post
      }

      const { error } = await supabase.from('social_posts').insert(postData);

      if (error) throw error;

      toast({
        title: "Success",
        description: `Your post has been shared ${postScope === 'global' ? 'globally' : 'with your organization'}!`,
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
      <DialogContent className={cn(
        "sm:max-w-[550px] max-h-[90vh] overflow-y-auto",
        "bg-gradient-to-br from-card/98 via-card/95 to-card/93",
        "backdrop-blur-2xl border-border/50",
        "shadow-2xl shadow-black/20"
      )}>
        <DialogHeader className="pb-4 border-b border-border/20">
          <DialogTitle className="flex items-center gap-3">
            <motion.div 
              className="relative"
              animate={{ rotate: [0, 5, -5, 0] }}
              transition={{ duration: 2, repeat: Infinity, repeatType: "reverse" }}
            >
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary/30 via-primary/20 to-accent/20 flex items-center justify-center">
                <Sparkles className="h-6 w-6 text-primary" />
              </div>
            </motion.div>
            <div>
              <span className="text-xl font-bold bg-gradient-to-r from-foreground to-foreground/80 bg-clip-text text-transparent">
                Create Post
              </span>
              <p className="text-xs text-muted-foreground mt-0.5">Share your farming experience</p>
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 pt-4">
          {/* Modern Scope Toggle - Global vs Tenant */}
          <div className="space-y-3">
            <Label className="text-sm font-semibold flex items-center gap-2">
              <Globe className="w-4 h-4 text-primary" />
              Post Visibility
            </Label>
            <ToggleGroup 
              type="single" 
              value={postScope}
              onValueChange={(value) => value && setPostScope(value as 'global' | 'tenant')}
              className="grid grid-cols-2 gap-2 p-1 bg-muted/30 rounded-xl"
            >
              <ToggleGroupItem 
                value="tenant" 
                className={cn(
                  "rounded-lg py-3 data-[state=on]:bg-gradient-to-r data-[state=on]:from-green-500/20 data-[state=on]:to-emerald-500/20",
                  "data-[state=on]:text-green-600 data-[state=on]:border-green-500/30",
                  "transition-all duration-300"
                )}
              >
                <Lock className="w-4 h-4 mr-2" />
                <div className="text-left">
                  <div className="font-semibold text-sm">Organization</div>
                  <div className="text-xs text-muted-foreground">Only your organization</div>
                </div>
              </ToggleGroupItem>
              <ToggleGroupItem 
                value="global"
                className={cn(
                  "rounded-lg py-3 data-[state=on]:bg-gradient-to-r data-[state=on]:from-blue-500/20 data-[state=on]:to-cyan-500/20",
                  "data-[state=on]:text-blue-600 data-[state=on]:border-blue-500/30",
                  "transition-all duration-300"
                )}
              >
                <Globe className="w-4 h-4 mr-2" />
                <div className="text-left">
                  <div className="font-semibold text-sm">Global</div>
                  <div className="text-xs text-muted-foreground">All farmers everywhere</div>
                </div>
              </ToggleGroupItem>
            </ToggleGroup>
          </div>

          {/* Community Selection (Optional) */}
          {communities.length > 0 && (
            <div className="space-y-2">
              <Label className="text-sm font-semibold flex items-center gap-2">
                <Users className="w-4 h-4 text-primary" />
                Select Community (optional)
              </Label>
              <div className="grid grid-cols-2 gap-2 max-h-32 overflow-y-auto p-1">
                {communities.map((community) => (
                  <motion.button
                    key={community.id}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setSelectedCommunity(
                      selectedCommunity === community.id ? null : community.id
                    )}
                    className={cn(
                      "px-3 py-2 rounded-lg text-xs font-medium transition-all duration-300",
                      "border border-border/50 hover:border-primary/30",
                      selectedCommunity === community.id
                        ? "bg-gradient-to-r from-primary/20 to-primary/10 text-primary border-primary/50"
                        : "bg-muted/30 hover:bg-muted/50"
                    )}
                  >
                    {community.name}
                  </motion.button>
                ))}
              </div>
            </div>
          )}

          {/* Modern Content Area */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-semibold">Content</Label>
              <span className={cn(
                "text-xs font-medium",
                characterCount > maxCharacters ? "text-destructive" : "text-muted-foreground"
              )}>
                {characterCount}/{maxCharacters}
              </span>
            </div>
            <div className="relative">
              <Textarea
                placeholder="Share your farming insights, ask questions, or celebrate successes..."
                value={content}
                onChange={(e) => {
                  setContent(e.target.value);
                  setCharacterCount(e.target.value.length);
                }}
                rows={6}
                className={cn(
                  "resize-none rounded-xl",
                  "bg-gradient-to-br from-muted/50 via-muted/30 to-muted/20",
                  "border-border/50 focus:border-primary/50",
                  "placeholder:text-muted-foreground/50",
                  "transition-all duration-300"
                )}
              />
              <AnimatePresence>
                {characterCount > maxCharacters && (
                  <motion.p
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="absolute -bottom-6 left-0 text-xs text-destructive"
                  >
                    Character limit exceeded
                  </motion.p>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* Modern Hashtags Input */}
          <div className="space-y-2">
            <Label className="text-sm font-semibold flex items-center gap-2">
              <Hash className="w-4 h-4 text-primary" />
              Hashtags
            </Label>
            <Input
              placeholder="#organic #farming #tips #success"
              value={hashtags}
              onChange={(e) => setHashtags(e.target.value)}
              className={cn(
                "rounded-xl",
                "bg-gradient-to-br from-muted/50 via-muted/30 to-muted/20",
                "border-border/50 focus:border-primary/50",
                "placeholder:text-muted-foreground/50",
                "transition-all duration-300"
              )}
            />
            <p className="text-xs text-muted-foreground">
              Add hashtags to increase visibility
            </p>
          </div>

          {/* Modern Action Buttons */}
          <div className="flex items-center justify-between pt-4 border-t border-border/20">
            <div className="flex gap-2">
              <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="rounded-xl hover:bg-primary/10 transition-all duration-300"
                >
                  <Camera className="h-5 w-5" />
                </Button>
              </motion.div>
              <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="rounded-xl hover:bg-primary/10 transition-all duration-300"
                >
                  <BarChart3 className="h-5 w-5" />
                </Button>
              </motion.div>
            </div>
            
            <div className="flex gap-3">
              <Button 
                variant="outline" 
                onClick={onClose} 
                disabled={loading}
                className={cn(
                  "rounded-xl px-6",
                  "border-border/50 hover:bg-muted/50",
                  "transition-all duration-300"
                )}
              >
                Cancel
              </Button>
              <motion.div
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <Button 
                  onClick={handleSubmit} 
                  disabled={loading || !content.trim() || characterCount > maxCharacters}
                  className={cn(
                    "rounded-xl px-6",
                    "bg-gradient-to-r from-primary via-primary to-primary/90",
                    "hover:from-primary/90 hover:to-primary",
                    "text-primary-foreground shadow-lg shadow-primary/30",
                    "transition-all duration-300"
                  )}
                >
                  {loading ? (
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                    >
                      <Sparkles className="w-4 h-4 mr-2" />
                    </motion.div>
                  ) : (
                    <Sparkles className="w-4 h-4 mr-2" />
                  )}
                  {loading ? "Posting..." : "Share Post"}
                </Button>
              </motion.div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}