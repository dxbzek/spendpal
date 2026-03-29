import { useState, useEffect, useRef } from 'react';

export function useCountUp(target: number, duration: number = 600): number {
  const [current, setCurrent] = useState(target);
  const prevTarget = useRef(target);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    // Skip animation on first render or if target hasn't changed
    if (prevTarget.current === target) return;

    const start = prevTarget.current;
    const end = target;
    prevTarget.current = target;

    const startTime = performance.now();

    const animate = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setCurrent(start + (end - start) * eased);

      if (progress < 1) {
        frameRef.current = requestAnimationFrame(animate);
      } else {
        setCurrent(end);
      }
    };

    frameRef.current = requestAnimationFrame(animate);

    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    };
  }, [target, duration]);

  return current;
}
