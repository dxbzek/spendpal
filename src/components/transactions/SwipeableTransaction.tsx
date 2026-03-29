import { useState } from 'react';
import { motion, useMotionValue, useTransform, PanInfo } from 'framer-motion';
import { Trash2, Tag } from 'lucide-react';

interface Props {
  children: React.ReactNode;
  onDelete: () => void;
  onCategorize?: () => void;
}

const SWIPE_THRESHOLD = 80;

const SwipeableTransaction = ({ children, onDelete, onCategorize }: Props) => {
  const x = useMotionValue(0);

  // Left-swipe (delete) — red background on right
  const deleteBgOpacity = useTransform(x, [-120, -60, 0], [1, 0.8, 0]);
  const deleteIconScale = useTransform(x, [-120, -60, 0], [1, 0.8, 0.5]);

  // Right-swipe (categorize) — accent background on left
  const categorizeBgOpacity = useTransform(x, [0, 60, 120], [0, 0.8, 1]);
  const categorizeIconScale = useTransform(x, [0, 60, 120], [0.5, 0.8, 1]);

  const [dragging, setDragging] = useState(false);

  const handleDragEnd = (_: any, info: PanInfo) => {
    setDragging(false);
    if (info.offset.x < -SWIPE_THRESHOLD) {
      onDelete();
    } else if (info.offset.x > SWIPE_THRESHOLD && onCategorize) {
      onCategorize();
    }
  };

  return (
    <div className="relative overflow-hidden">
      {/* Delete background (right side) */}
      <motion.div
        className="absolute inset-0 flex items-center justify-end pr-6 bg-destructive rounded-xl"
        style={{ opacity: deleteBgOpacity }}
      >
        <motion.div style={{ scale: deleteIconScale }}>
          <Trash2 size={20} className="text-destructive-foreground" />
        </motion.div>
      </motion.div>

      {/* Categorize background (left side) */}
      {onCategorize && (
        <motion.div
          className="absolute inset-0 flex items-center justify-start pl-6 bg-primary rounded-xl"
          style={{ opacity: categorizeBgOpacity }}
        >
          <motion.div style={{ scale: categorizeIconScale }}>
            <Tag size={20} className="text-primary-foreground" />
          </motion.div>
        </motion.div>
      )}

      {/* Swipeable content */}
      <motion.div
        drag="x"
        role="listitem"
        aria-label={onCategorize ? "Swipe left to delete, right to categorize" : "Swipe left to delete"}
        dragConstraints={{ left: -140, right: onCategorize ? 140 : 0 }}
        dragElastic={0.1}
        onDragStart={() => setDragging(true)}
        onDragEnd={handleDragEnd}
        style={{ x }}
        className="relative bg-card z-10 touch-pan-y"
      >
        {children}
      </motion.div>
    </div>
  );
};

export default SwipeableTransaction;
