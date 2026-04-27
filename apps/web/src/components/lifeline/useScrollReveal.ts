import { useEffect, useRef, useState } from "react";

export function useScrollReveal(threshold = 0.16) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let cancelled = false;
    const reveal = () => {
      queueMicrotask(() => {
        if (!cancelled) setVisible(true);
      });
    };

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReducedMotion) {
      reveal();
      return () => {
        cancelled = true;
      };
    }

    const rect = el.getBoundingClientRect();
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
    if (rect.top < viewportHeight && rect.bottom > 0) {
      reveal();
      return () => {
        cancelled = true;
      };
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          reveal();
          observer.unobserve(el);
        }
      },
      { threshold }
    );

    observer.observe(el);
    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [threshold]);

  return { ref, visible };
}
