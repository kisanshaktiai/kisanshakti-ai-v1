import { Heart, MessageCircle, Share2, Bookmark, CheckCircle } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { formatDistanceToNow } from 'date-fns';
import { useState } from 'react';
import { CommentSection } from './CommentSection';

interface PostCardProps {
  post: any;
  onLike: () => void;
  onShare: () => void;
  onSave: () => void;
  isLiked?: boolean;
  isSaved?: boolean;
}

export function PostCard({ post, onLike, onShare, onSave, isLiked, isSaved }: PostCardProps) {
  const [showComments, setShowComments] = useState(false);

  return (
    <Card className="border-0 border-b border-border/50 rounded-none bg-card/50 backdrop-blur-sm hover:bg-card/80 transition-all">
      <div className="p-4">
        {/* Modern Header */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            <Avatar className="w-10 h-10 border-2 border-background shadow-sm">
              <AvatarFallback className="bg-gradient-to-br from-primary/20 to-primary/10 text-primary font-semibold">
                {post.farmer?.farmer_name?.[0]?.toUpperCase() || 'F'}
              </AvatarFallback>
            </Avatar>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-foreground">{post.farmer?.farmer_name || 'Farmer'}</span>
                {post.is_expert_verified && (
                  <CheckCircle className="w-4 h-4 text-primary" />
                )}
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                {post.community && (
                  <>
                    <span className="text-primary/70">{post.community.name}</span>
                    <span className="opacity-50">•</span>
                  </>
                )}
                <span>{formatDistanceToNow(new Date(post.created_at), { addSuffix: true })}</span>
              </div>
            </div>
          </div>
          {post.is_success_story && (
            <Badge variant="secondary" className="bg-gradient-to-r from-primary/10 to-primary/5 text-primary border-primary/20">
              Success Story
            </Badge>
          )}
        </div>

        {/* Content */}
        <div className="mb-3">
          <p className="text-sm text-foreground/90 whitespace-pre-wrap leading-relaxed">{post.content}</p>
          
          {/* Media */}
          {post.media_urls && post.media_urls.length > 0 && (
            <div className="mt-3 grid grid-cols-2 gap-2">
              {post.media_urls.map((url: string, index: number) => (
                <div key={index} className="relative overflow-hidden rounded-xl group">
                  <img
                    src={url}
                    alt={`Post media ${index + 1}`}
                    className="w-full h-40 object-cover transition-transform group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              ))}
            </div>
          )}

          {/* Poll */}
          {post.post_type === 'poll' && post.poll_options && (
            <div className="mt-3 space-y-2">
              {post.poll_options.map((option: any, index: number) => (
                <Button
                  key={index}
                  variant="outline"
                  className="w-full justify-start border-border/50 hover:bg-primary/5 hover:border-primary/50 transition-all"
                  size="sm"
                >
                  {option.text}
                </Button>
              ))}
            </div>
          )}

          {/* Hashtags */}
          {post.hashtags && post.hashtags.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {post.hashtags.map((tag: string) => (
                <Badge 
                  key={tag} 
                  variant="secondary" 
                  className="text-xs bg-primary/5 text-primary hover:bg-primary/10 cursor-pointer transition-colors"
                >
                  #{tag}
                </Badge>
              ))}
            </div>
          )}
        </div>

        {/* Modern Actions */}
        <div className="flex items-center justify-between border-t border-border/30 pt-2">
          <div className="flex items-center gap-0.5">
            <Button
              variant="ghost"
              size="sm"
              onClick={onLike}
              className={`hover:bg-primary/5 transition-all ${isLiked ? 'text-destructive' : 'text-muted-foreground hover:text-foreground'}`}
            >
              <Heart className={`w-4 h-4 mr-1.5 transition-transform ${isLiked ? 'fill-current scale-110' : ''}`} />
              <span className="text-xs font-medium">{post.likes_count || 0}</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowComments(!showComments)}
              className="text-muted-foreground hover:text-foreground hover:bg-primary/5 transition-all"
            >
              <MessageCircle className="w-4 h-4 mr-1.5" />
              <span className="text-xs font-medium">{post.comments_count || 0}</span>
            </Button>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={onShare}
              className="text-muted-foreground hover:text-foreground hover:bg-primary/5 transition-all"
            >
              <Share2 className="w-4 h-4 mr-1.5" />
              <span className="text-xs font-medium">{post.shares_count || 0}</span>
            </Button>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onSave}
            className={`hover:bg-primary/5 transition-all ${isSaved ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}
          >
            <Bookmark className={`w-4 h-4 transition-transform ${isSaved ? 'fill-current scale-110' : ''}`} />
          </Button>
        </div>

        {/* Comments Section */}
        {showComments && (
          <CommentSection postId={post.id} comments={post.post_comments || []} />
        )}
      </div>
    </Card>
  );
}