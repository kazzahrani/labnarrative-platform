"use client";

import { useEffect, useRef, useState } from "react";

type NumberFormatter = (value: number) => string;

type AnimatedNumberProps = {
  value: number | null | undefined;
  format: NumberFormatter;
};

export function AnimatedNumber({ value, format }: AnimatedNumberProps) {
  const target = value != null && Number.isFinite(value) ? value : null;
  const [display, setDisplay] = useState(target ?? 0);
  const previous = useRef(target ?? 0);

  useEffect(() => {
    if (target == null) return;
    const from = previous.current;
    const to = target;
    previous.current = to;
    if (typeof window === "undefined" || window.matchMedia("(prefers-reduced-motion: reduce)").matches || Math.abs(to - from) < 0.000001) {
      setDisplay(to);
      return;
    }
    let frame = 0;
    const started = performance.now();
    const duration = 330;
    const tick = (now: number) => {
      const progress = Math.min(1, (now - started) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(from + (to - from) * eased);
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target]);

  return <>{target == null ? "—" : format(display)}</>;
}

export function useAnalyticsMotion<T extends HTMLElement>(refreshKey: string | number) {
  const rootRef = useRef<T | null>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || typeof window === "undefined" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const nodes = Array.from(root.querySelectorAll<HTMLElement>("[data-analytics-motion]"));
    if (!nodes.length) return;
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const node = entry.target as HTMLElement;
        node.getAnimations().forEach((animation) => animation.cancel());
        node.animate(
          [
            { opacity: 0.58, transform: "translateY(8px) scale(.998)" },
            { opacity: 1, transform: "translateY(0) scale(1)" },
          ],
          { duration: 270, easing: "cubic-bezier(.2,.8,.2,1)", fill: "both" },
        );
        observer.unobserve(node);
      }
    }, { threshold: 0.12, rootMargin: "0px 0px -5% 0px" });
    nodes.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, [refreshKey]);

  return rootRef;
}
