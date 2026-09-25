import { useEffect, useRef, useState } from 'react';

/**
 * Counts from zero to `target` once the element is on screen. Returns the current value, a
 * ref setter, and whether the count has settled: the caller shows the animating digits with
 * aria-hidden and announces the settled number once, so a screen reader is not read a new
 * number every frame. With reduced motion the value is set straight away and is settled
 * immediately.
 */
export function useCountUp(
  target: number,
  reduced: boolean,
  durationMs = 1100,
): [number, (node: HTMLElement | null) => void, boolean] {
  const [value, setValue] = useState(reduced ? target : 0);
  const [settled, setSettled] = useState(reduced);
  const [visible, setVisible] = useState(false);
  const nodeRef = useRef<HTMLElement | null>(null);

  const setNode = (node: HTMLElement | null): void => {
    nodeRef.current = node;
  };

  useEffect(() => {
    const node = nodeRef.current;
    if (!node || visible) return undefined;
    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return undefined;
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) setVisible(true);
    }, { rootMargin: '0px 0px -10% 0px' });
    observer.observe(node);
    return () => observer.disconnect();
  }, [visible]);

  useEffect(() => {
    if (!visible) return undefined;
    if (reduced) {
      setValue(target);
      setSettled(true);
      return undefined;
    }
    let frame = 0;
    let start: number | null = null;
    const step = (now: number): void => {
      if (start === null) start = now;
      const t = Math.min(1, (now - start) / durationMs);
      // Ease out cubic: fast first, settles on the exact target.
      setValue(Math.round(target * (1 - (1 - t) ** 3)));
      if (t < 1) {
        frame = requestAnimationFrame(step);
      } else {
        setValue(target);
        setSettled(true);
      }
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [visible, reduced, target, durationMs]);

  return [value, setNode, settled];
}
