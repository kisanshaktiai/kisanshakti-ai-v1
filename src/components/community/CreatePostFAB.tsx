import React from 'react';
import { motion } from 'framer-motion';
import { Plus, Mic } from 'lucide-react';

interface CreatePostFABProps {
  onClick: () => void;
}

export const CreatePostFAB: React.FC<CreatePostFABProps> = ({ onClick }) => {
  return (
    <motion.button
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      onClick={onClick}
      className="fixed bottom-24 right-4 z-50 w-14 h-14 rounded-full bg-gradient-to-br from-primary to-primary/80 shadow-lg shadow-primary/30 flex items-center justify-center text-primary-foreground"
    >
      <Plus className="w-6 h-6" />
      
      {/* Pulse effect */}
      <motion.div
        className="absolute inset-0 rounded-full bg-primary/30"
        animate={{ scale: [1, 1.2, 1], opacity: [0.5, 0, 0.5] }}
        transition={{ duration: 2, repeat: Infinity }}
      />
    </motion.button>
  );
};
