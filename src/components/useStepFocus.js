import { useEffect } from 'react';

export function useStepFocus(ref, enabled = true, { block = 'center' } = {}) {
  useEffect(() => {
    if (!enabled) return;
    const frame = requestAnimationFrame(() => ref.current?.scrollIntoView({ block, behavior: 'instant' }));
    return () => cancelAnimationFrame(frame);
  }, [ref, enabled, block]);
}
