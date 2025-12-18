import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { 
  Plus, Users, Loader2, ChevronRight, 
  Mic, Search, Sprout, MessageCircle
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useCommunityGroups, useJoinGroup, CropGroup, CommunityGroup } from '@/hooks/useCommunityGroups';
import { CreateGroupModal } from './CreateGroupModal';

interface CommunityGroupsProps {
  viewLanguage: string;
}

// Emoji icons for crop groups
const CROP_ICONS: Record<string, string> = {
  'wheat': '🌾',
  'rice': '🍚',
  'cotton': '🧶',
  'sugarcane': '🎋',
  'vegetables': '🥬',
  'fruits': '🍎',
  'pulses': '🫘',
  'oilseeds': '🌻',
  'spices': '🌶️',
  'flowers': '🌸',
  'default': '🌱'
};

const getGroupIcon = (groupKey: string, iconField?: string): string => {
  if (iconField) return iconField;
  return CROP_ICONS[groupKey.toLowerCase()] || CROP_ICONS['default'];
};

const getGroupName = (group: CropGroup, language: string): string => {
  if (language === 'hi' && group.group_name_hi) return group.group_name_hi;
  if (language === 'mr' && group.group_name_mr) return group.group_name_mr;
  return group.group_name;
};

export const CommunityGroups: React.FC<CommunityGroupsProps> = ({ viewLanguage }) => {
  const { t } = useTranslation('social');
  const [searchQuery, setSearchQuery] = useState('');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  
  const { data, isLoading } = useCommunityGroups();
  const joinGroupMutation = useJoinGroup();

  const cropGroups = data?.cropGroups || [];
  const userGroups = data?.userGroups || [];
  const membershipIds = data?.membershipIds || [];

  // Filter groups based on search
  const filteredCropGroups = cropGroups.filter(g => 
    getGroupName(g, viewLanguage).toLowerCase().includes(searchQuery.toLowerCase())
  );
  
  const filteredUserGroups = userGroups.filter(g =>
    g.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleJoinGroup = (groupId: string) => {
    joinGroupMutation.mutate(groupId);
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="px-4 pb-8">
      {/* Search Bar */}
      <div className="relative mb-6">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
        <Input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={t('social.groups.search', 'Search groups...')}
          className="pl-12 h-12 rounded-2xl bg-card/80 border-border/50"
        />
      </div>

      {/* Create Group Button - Big and Prominent */}
      <motion.button
        whileTap={{ scale: 0.98 }}
        onClick={() => setIsCreateModalOpen(true)}
        className={cn(
          "w-full p-4 mb-6 rounded-2xl",
          "bg-gradient-to-r from-primary to-primary/80",
          "flex items-center justify-center gap-3",
          "text-primary-foreground font-semibold text-lg",
          "shadow-lg shadow-primary/20"
        )}
      >
        <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center">
          <Plus className="w-6 h-6" />
        </div>
        <span>{t('social.groups.create', 'Create New Group')}</span>
      </motion.button>

      {/* Crop-Based Groups Section */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
          <Sprout className="w-5 h-5 text-primary" />
          {t('social.groups.crop_groups', 'Crop Groups')}
        </h2>
        
        <div className="grid grid-cols-2 gap-3">
          {filteredCropGroups.map((group, index) => (
            <motion.div
              key={group.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              className={cn(
                "bg-card/80 backdrop-blur-sm rounded-2xl p-4",
                "border border-border/50 shadow-sm",
                "flex flex-col items-center text-center"
              )}
            >
              <div className="text-4xl mb-2">
                {getGroupIcon(group.group_key, group.group_icon)}
              </div>
              <h3 className="font-semibold text-foreground text-sm mb-1">
                {getGroupName(group, viewLanguage)}
              </h3>
              {group.description && (
                <p className="text-xs text-muted-foreground line-clamp-2 mb-3">
                  {group.description}
                </p>
              )}
              <Button
                size="sm"
                variant="outline"
                className="rounded-full text-xs w-full"
              >
                <MessageCircle className="w-3 h-3 mr-1" />
                {t('social.groups.discuss', 'Discuss')}
              </Button>
            </motion.div>
          ))}
        </div>

        {filteredCropGroups.length === 0 && (
          <p className="text-center text-muted-foreground py-4">
            {t('social.groups.no_crop_groups', 'No crop groups found')}
          </p>
        )}
      </div>

      {/* Community Groups Section */}
      <div>
        <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
          <Users className="w-5 h-5 text-primary" />
          {t('social.groups.community_groups', 'Community Groups')}
        </h2>

        <div className="space-y-3">
          {filteredUserGroups.map((group, index) => (
            <motion.div
              key={group.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.05 }}
              className={cn(
                "bg-card/80 backdrop-blur-sm rounded-2xl p-4",
                "border border-border/50 shadow-sm",
                "flex items-center gap-4"
              )}
            >
              {/* Group Avatar */}
              <div className="w-14 h-14 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center text-2xl flex-shrink-0">
                {group.avatar_url || '👥'}
              </div>

              {/* Group Info */}
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-foreground truncate">
                  {group.name}
                </h3>
                {group.description && (
                  <p className="text-xs text-muted-foreground line-clamp-1">
                    {group.description}
                  </p>
                )}
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Users className="w-3 h-3" />
                    {group.member_count} {t('social.groups.members', 'members')}
                  </span>
                </div>
              </div>

              {/* Join/View Button */}
              {group.is_member ? (
                <Button 
                  size="sm" 
                  variant="secondary"
                  className="rounded-full"
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              ) : (
                <Button
                  size="sm"
                  onClick={() => handleJoinGroup(group.id)}
                  disabled={joinGroupMutation.isPending}
                  className="rounded-full"
                >
                  {joinGroupMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    t('social.groups.join', 'Join')
                  )}
                </Button>
              )}
            </motion.div>
          ))}
        </div>

        {filteredUserGroups.length === 0 && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-center py-12"
          >
            <div className="text-6xl mb-4">👥</div>
            <h3 className="text-lg font-semibold text-foreground mb-2">
              {t('social.groups.no_groups', 'No groups yet')}
            </h3>
            <p className="text-muted-foreground text-sm mb-4">
              {t('social.groups.be_first', 'Be the first to create a group!')}
            </p>
            <Button
              onClick={() => setIsCreateModalOpen(true)}
              className="rounded-full gap-2"
            >
              <Plus className="w-4 h-4" />
              {t('social.groups.create', 'Create Group')}
            </Button>
          </motion.div>
        )}
      </div>

      {/* Create Group Modal */}
      <CreateGroupModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
      />
    </div>
  );
};
