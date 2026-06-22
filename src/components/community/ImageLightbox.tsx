import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';

interface Props {
  src: string | null;
  onClose: () => void;
  alt?: string;
}

export const ImageLightbox: React.FC<Props> = ({ src, onClose, alt }) => {
  useEffect(() => {
    if (!src) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [src, onClose]);

  return (
    <AnimatePresence>
      {src && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 z-[200] bg-overlay-dark flex items-center justify-center"
        >
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-3 rounded-full bg-overlay-light/10 text-overlay-light"
            aria-label="Close"
          >
            <X className="w-6 h-6" />
          </button>
          <motion.img
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={0.4}
            onDragEnd={(_, info) => Math.abs(info.offset.y) > 100 && onClose()}
            src={src}
            alt={alt || 'Image'}
            className="max-w-full max-h-full object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
};
