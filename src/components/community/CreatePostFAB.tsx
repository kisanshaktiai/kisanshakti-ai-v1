import React from 'react';
import { motion } from 'framer-motion';
import { Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface CreatePostFABProps {
  onClick: () => void;
}

/**
 * Floating "create post" button. Sits above the voice microphone, which
 * AppLayout keeps at bottom-24 right-4 on every farmer screen.
 */
export const CreatePostFAB: React.FC<CreatePostFABProps> = ({ onClick }) => {
  const { t } = useTranslation();
  return (
    <motion.button
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      onClick={onClick}
      aria-label={t('social.post.create')}
      className="fixed bottom-44 right-4 z-50 w-14 h-14 rounded-full bg-gradient-to-br from-primary to-primary/80 shadow-lg shadow-primary/30 flex items-center justify-center text-primary-foreground"
    >
      <Plus className="w-6 h-6" />
    </motion.button>
  );
};
