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
    <Card className="border-0 border-b rounded-none">
      <div className="p-4">
        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            <Avatar className="w-10 h-10">
              <AvatarFallback className="bg-primary/10 text-primary">
                {post.farmer?.farmer_name?.[0] || 'F'}
              </AvatarFallback>
            </Avatar>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-medium">{post.farmer?.farmer_name || 'Farmer'}</span>
                {post.is_expert_verified && (
                  <CheckCircle className="w-4 h-4 text-primary" />
                )}
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                {post.community && (
                  <>
                    <span>{post.community.name}</span>
                    <span>•</span>
                  </>
                )}
                <span>{formatDistanceToNow(new Date(post.created_at), { addSuffix: true })}</span>
              </div>
            </div>
          </div>
          {post.is_success_story && (
            <Badge variant="secondary" className="bg-success/10 text-success">
              Success Story
            </Badge>
          )}
        </div>

        {/* Content */}
        <div className="mb-3">
          <p className="text-sm whitespace-pre-wrap">{post.content}</p>
          
          {/* Media */}
          {post.media_urls && post.media_urls.length > 0 && (
            <div className="mt-3 grid grid-cols-2 gap-2">
              {post.media_urls.map((url: string, index: number) => (
                <img
                  key={index}
                  src={url}
                  alt={`Post media ${index + 1}`}
                  className="rounded-lg w-full h-40 object-cover"
                />
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
                  className="w-full justify-start"
                  size="sm"
                >
                  {option.text}
                </Button>
              ))}
            </div>
          )}

          {/* Hashtags */}
          {post.hashtags && post.hashtags.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {post.hashtags.map((tag: string) => (
                <Badge key={tag} variant="secondary" className="text-xs">
                  #{tag}
                </Badge>
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={onLike}
              className={isLiked ? 'text-destructive' : ''}
            >
              <Heart className={`w-4 h-4 mr-1 ${isLiked ? 'fill-current' : ''}`} />
              {post.likes_count || 0}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowComments(!showComments)}
            >
              <MessageCircle className="w-4 h-4 mr-1" />
              {post.comments_count || 0}
            </Button>
            <Button variant="ghost" size="sm" onClick={onShare}>
              <Share2 className="w-4 h-4 mr-1" />
              {post.shares_count || 0}
            </Button>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onSave}
            className={isSaved ? 'text-primary' : ''}
          >
            <Bookmark className={`w-4 h-4 ${isSaved ? 'fill-current' : ''}`} />
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