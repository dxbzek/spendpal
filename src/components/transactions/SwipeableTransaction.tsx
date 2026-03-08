import { useState } from 'react';
import { motion, useMotionValue, useTransform, PanInfo } from 'framer-motion';
import { Trash2 } from 'lucide-react';

interface Props {
  children: React.ReactNode;
  onDelete: () => void;
}

const SWIPE_THRESHOLD = -80;

const SwipeableTransaction = ({ children, onDelete }: Props) => {
  const x = useMotionValue(0);
  const bgOpacity = useTransform(x, [-120, -60, 0], [1, 0.8, 0]);
  const iconScale = useTransform(x, [-120, -60, 0], [1, 0.8, 0.5]);
  const [dragging, setDragging] = useState(false);

  const handleDragEnd = (_: any, info: PanInfo) => {
    setDragging(false);
    if (info.offset.x < SWIPE_THRESHOLD) {
      onDelete();
    }
  };

  return (
    <div className="relative overflow-hidden">
      {/* Delete background */}
      <motion.div
        className="absolute inset-0 flex items-center justify-end pr-6 bg-destructive rounded-xl"
        style={{ opacity: bgOpacity }}
      >
        <motion.div style={{ scale: iconScale }}>
          <Trash2 size={20} className="text-destructive-foreground" />
        </motion.div>
      </motion.div>

      {/* Swipeable content */}
      <motion.div
        drag="x"
        dragConstraints={{ left: -140, right: 0 }}
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
