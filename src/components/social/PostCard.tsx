import { Heart, MessageCircle, Share2, Bookmark, CheckCircle, Globe, Lock, MoreVertical, Sparkles } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { formatDistanceToNow } from 'date-fns';
import { useState } from 'react';
import { CommentSection } from './CommentSection';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

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
  const isGlobalPost = !post.tenant_id;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="relative"
    >
      <Card className={cn(
        "border-0 rounded-2xl mb-4 mx-2 md:mx-0",
        "bg-gradient-to-br from-card/95 via-card/90 to-card/85",
        "backdrop-blur-xl shadow-lg shadow-black/5",
        "hover:shadow-xl hover:shadow-primary/5",
        "transition-all duration-300"
      )}>
        <div className="p-4 md:p-5">
          {/* Modern Header with Global/Tenant Indicator */}
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3 flex-1">
              <motion.div
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="relative"
              >
                <Avatar className="w-11 h-11 md:w-12 md:h-12 ring-2 ring-background shadow-md">
                  <AvatarFallback className={cn(
                    "font-bold text-lg",
                    "bg-gradient-to-br from-primary/30 via-primary/20 to-accent/20",
                    "text-primary"
                  )}>
                    {post.farmer?.farmer_name?.[0]?.toUpperCase() || 'F'}
                  </AvatarFallback>
                </Avatar>
                {post.is_expert_verified && (
                  <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-primary rounded-full flex items-center justify-center ring-2 ring-background">
                    <CheckCircle className="w-3 h-3 text-primary-foreground" />
                  </div>
                )}
              </motion.div>
              
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-foreground truncate">
                    {post.farmer?.farmer_name || 'Farmer'}
                  </span>
                  {/* Global/Tenant Badge */}
                  <Badge 
                    variant="outline" 
                    className={cn(
                      "text-[10px] px-2 py-0.5 rounded-full",
                      isGlobalPost 
                        ? "bg-gradient-to-r from-blue-500/10 to-cyan-500/10 text-blue-600 border-blue-500/30"
                        : "bg-gradient-to-r from-green-500/10 to-emerald-500/10 text-green-600 border-green-500/30"
                    )}
                  >
                    {isGlobalPost ? <Globe className="w-3 h-3 mr-1" /> : <Lock className="w-3 h-3 mr-1" />}
                    {isGlobalPost ? 'Global' : 'Organization'}
                  </Badge>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                  {post.community && (
                    <>
                      <Badge variant="secondary" className="text-[10px] px-2 py-0 bg-primary/5 border-0">
                        {post.community.name}
                      </Badge>
                      <span className="opacity-50">•</span>
                    </>
                  )}
                  <span>{formatDistanceToNow(new Date(post.created_at), { addSuffix: true })}</span>
                </div>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              {post.is_success_story && (
                <Badge className="bg-gradient-to-r from-yellow-500/20 to-orange-500/20 text-orange-600 border-orange-500/30 text-[10px]">
                  <Sparkles className="w-3 h-3 mr-1" />
                  Success
                </Badge>
              )}
              <Button variant="ghost" size="icon" className="w-8 h-8 rounded-full hover:bg-muted/50">
                <MoreVertical className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Content with Glass Effect */}
          <div className="mb-4 px-1">
            <p className="text-sm md:text-base text-foreground/90 whitespace-pre-wrap leading-relaxed">
              {post.content}
            </p>
            
            {/* Modern Media Grid */}
            {post.media_urls && post.media_urls.length > 0 && (
              <div className={cn(
                "mt-4 grid gap-2",
                post.media_urls.length === 1 ? "grid-cols-1" : "grid-cols-2"
              )}>
                {post.media_urls.map((url: string, index: number) => (
                  <motion.div 
                    key={index}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className="relative overflow-hidden rounded-2xl group cursor-pointer"
                  >
                    <img
                      src={url}
                      alt={`Post media ${index + 1}`}
                      className={cn(
                        "w-full object-cover transition-all duration-500",
                        "group-hover:scale-105 group-hover:brightness-110",
                        post.media_urls.length === 1 ? "h-64 md:h-80" : "h-40 md:h-48"
                      )}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-all duration-300" />
                  </motion.div>
                ))}
              </div>
            )}

            {/* Modern Poll */}
            {post.post_type === 'poll' && post.poll_options && (
              <div className="mt-4 space-y-2 p-4 rounded-2xl bg-gradient-to-br from-muted/50 to-muted/30 backdrop-blur-sm">
                {post.poll_options.map((option: any, index: number) => (
                  <motion.button
                    key={index}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className="w-full p-3 rounded-xl bg-gradient-to-r from-card/80 to-card/60 hover:from-primary/10 hover:to-primary/5 transition-all duration-300 text-left text-sm font-medium border border-border/50 hover:border-primary/30"
                  >
                    {option.text}
                  </motion.button>
                ))}
              </div>
            )}

            {/* Modern Hashtags */}
            {post.hashtags && post.hashtags.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {post.hashtags.map((tag: string) => (
                  <motion.div
                    key={tag}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    <Badge 
                      variant="secondary" 
                      className="text-xs px-3 py-1 rounded-full bg-gradient-to-r from-primary/10 to-primary/5 text-primary hover:from-primary/20 hover:to-primary/10 cursor-pointer transition-all duration-300 border-primary/20"
                    >
                      #{tag}
                    </Badge>
                  </motion.div>
                ))}
              </div>
            )}
          </div>

          {/* Ultra Modern Actions Bar */}
          <div className="flex items-center justify-between pt-3 border-t border-border/20">
            <div className="flex items-center gap-1">
              <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onLike}
                  className={cn(
                    "rounded-xl hover:bg-primary/10 transition-all duration-300",
                    isLiked && "text-red-500"
                  )}
                >
                  <Heart className={cn(
                    "w-4 h-4 mr-1.5 transition-all duration-300",
                    isLiked && "fill-current"
                  )} />
                  <span className="text-xs font-semibold">{post.likes_count || 0}</span>
                </Button>
              </motion.div>

              <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowComments(!showComments)}
                  className="rounded-xl hover:bg-primary/10 transition-all duration-300"
                >
                  <MessageCircle className="w-4 h-4 mr-1.5" />
                  <span className="text-xs font-semibold">{post.comments_count || 0}</span>
                </Button>
              </motion.div>

              <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={onShare}
                  className="rounded-xl hover:bg-primary/10 transition-all duration-300"
                >
                  <Share2 className="w-4 h-4 mr-1.5" />
                  <span className="text-xs font-semibold">{post.shares_count || 0}</span>
                </Button>
              </motion.div>
            </div>

            <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
              <Button
                variant="ghost"
                size="sm"
                onClick={onSave}
                className={cn(
                  "rounded-xl hover:bg-primary/10 transition-all duration-300",
                  isSaved && "text-primary"
                )}
              >
                <Bookmark className={cn(
                  "w-4 h-4 transition-all duration-300",
                  isSaved && "fill-current"
                )} />
              </Button>
            </motion.div>
          </div>

          {/* Comments Section with Smooth Animation */}
          {showComments && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.3 }}
              className="mt-4 pt-4 border-t border-border/20"
            >
              <CommentSection postId={post.id} comments={post.post_comments || []} />
            </motion.div>
          )}
        </div>
      </Card>
    </motion.div>
  );
}