import { useRef, useState } from 'react';
import { Trash2, Tag, MoreVertical } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface Props {
  children: React.ReactNode;
  onDelete: () => void;
  onCategorize?: () => void;
}

const SWIPE_THRESHOLD = 80;
const MAX_LEFT = -140;
const AXIS_LOCK_SLOP = 8; // px of movement before we commit to a horizontal swipe

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

/**
 * Swipe-to-act row. Reimplemented on native Pointer Events (previously
 * framer-motion `drag`) so the app can ship framer-motion's lighter
 * `domAnimation` feature set instead of the full `domMax` that drag requires.
 * Behaviour is preserved: left past the threshold deletes, right categorizes,
 * vertical movement scrolls the list untouched, and the overflow menu remains
 * the accessible fallback for keyboard / non-touch users.
 */
const SwipeableTransaction = ({ children, onDelete, onCategorize }: Props) => {
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const dxRef = useRef(0);
  const startX = useRef(0);
  const startY = useRef(0);
  const axis = useRef<null | 'x' | 'y'>(null);
  const activePointer = useRef<number | null>(null);

  const maxRight = onCategorize ? 140 : 0;

  const setOffset = (n: number) => { dxRef.current = n; setDx(n); };

  const reset = () => {
    setOffset(0);
    setDragging(false);
    axis.current = null;
    activePointer.current = null;
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    activePointer.current = e.pointerId;
    startX.current = e.clientX;
    startY.current = e.clientY;
    axis.current = null;
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (activePointer.current !== e.pointerId) return;
    const deltaX = e.clientX - startX.current;
    const deltaY = e.clientY - startY.current;

    // Commit to an axis once movement clears the slop, so vertical scrolls are
    // left to the browser and never get hijacked as a swipe.
    if (axis.current === null) {
      if (Math.abs(deltaX) < AXIS_LOCK_SLOP && Math.abs(deltaY) < AXIS_LOCK_SLOP) return;
      axis.current = Math.abs(deltaX) > Math.abs(deltaY) ? 'x' : 'y';
      if (axis.current === 'x') {
        e.currentTarget.setPointerCapture(e.pointerId);
        setDragging(true);
      }
    }
    if (axis.current !== 'x') return;

    // Rubber-band beyond the constraints, matching the old dragElastic feel.
    let next = deltaX;
    if (next < MAX_LEFT) next = MAX_LEFT + (next - MAX_LEFT) * 0.2;
    else if (next > maxRight) next = maxRight + (next - maxRight) * 0.2;
    setOffset(next);
  };

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (activePointer.current !== e.pointerId) return;
    const finalDx = dxRef.current;
    const wasHorizontal = axis.current === 'x';
    reset();
    if (!wasHorizontal) return;
    if (finalDx < -SWIPE_THRESHOLD) onDelete();
    else if (finalDx > SWIPE_THRESHOLD && onCategorize) onCategorize();
  };

  const deleteProgress = dx < 0 ? clamp01(-dx / 120) : 0;
  const categorizeProgress = dx > 0 ? clamp01(dx / 120) : 0;

  return (
    <div className="relative overflow-hidden group/tx">
      {/* Delete background (right side) */}
      <div
        className="absolute inset-0 flex items-center justify-end pr-6 bg-destructive"
        style={{ opacity: deleteProgress }}
      >
        <div style={{ transform: `scale(${0.5 + deleteProgress * 0.5})` }}>
          <Trash2 size={20} className="text-destructive-foreground" />
        </div>
      </div>

      {/* Categorize background (left side) */}
      {onCategorize && (
        <div
          className="absolute inset-0 flex items-center justify-start pl-6 bg-primary"
          style={{ opacity: categorizeProgress }}
        >
          <div style={{ transform: `scale(${0.5 + categorizeProgress * 0.5})` }}>
            <Tag size={20} className="text-primary-foreground" />
          </div>
        </div>
      )}

      {/* Swipeable content */}
      <div
        role="listitem"
        aria-label={onCategorize ? 'Swipe left to delete, right to categorize' : 'Swipe left to delete'}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={reset}
        style={{
          transform: `translateX(${dx}px)`,
          transition: dragging ? 'none' : 'transform 0.2s ease-out',
          touchAction: 'pan-y',
        }}
        className="relative bg-card z-10"
      >
        {children}
      </div>

      {/* Keyboard/pointer fallback - overflow menu for non-touch users */}
      <div className="absolute right-2 top-1/2 -translate-y-1/2 z-20 opacity-0 group-hover/tx:opacity-100 focus-within:opacity-100 transition-opacity">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="p-1.5 rounded-lg bg-card border border-border shadow-sm text-muted-foreground hover:text-foreground"
              aria-label="Transaction actions"
            >
              <MoreVertical size={14} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-[120px]">
            {onCategorize && (
              <DropdownMenuItem onClick={onCategorize} className="gap-2 text-xs">
                <Tag size={12} /> Categorize
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={onDelete} className="gap-2 text-xs text-destructive focus:text-destructive">
              <Trash2 size={12} /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
};

export default SwipeableTransaction;
