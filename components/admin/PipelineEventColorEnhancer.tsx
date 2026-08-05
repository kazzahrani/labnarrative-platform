"use client";

import { useEffect } from "react";

const eventHues = [
  4, 24, 44, 64, 86, 108, 132, 154, 176,
  196, 216, 236, 256, 276, 296, 316, 336, 356,
];

function hashStatus(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function normalizeStatus(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, "-");
}

function findPipelineSection(): HTMLElement | null {
  const title = Array.from(document.querySelectorAll("h3")).find(
    (element) => element.textContent?.trim().toLowerCase() === "pipeline events",
  );
  const titleSection = title?.closest<HTMLElement>("section");
  if (titleSection) return titleSection;

  const recentActivityLabel = Array.from(document.querySelectorAll("p")).find(
    (element) => element.textContent?.trim().toLowerCase() === "recent activity",
  );
  const activitySection = recentActivityLabel?.closest<HTMLElement>("section");
  if (activitySection) return activitySection;

  return Array.from(document.querySelectorAll<HTMLElement>("section")).find((section) => {
    const hasEvent = Array.from(section.querySelectorAll<HTMLElement>("div")).some((element) => {
      const children = Array.from(element.children);
      return children.some((child) => child.tagName === "STRONG")
        && children.some((child) => child.tagName === "TIME");
    });
    return hasEvent;
  }) ?? null;
}

function findPipelineEvents(): HTMLElement[] {
  const section = findPipelineSection();
  if (!section) return [];

  return Array.from(section.querySelectorAll<HTMLElement>("div")).filter((element) => {
    const children = Array.from(element.children);
    return children.some((child) => child.tagName === "STRONG")
      && children.some((child) => child.tagName === "TIME");
  });
}

function applyEventColors() {
  if (window.location.pathname !== "/admin/automation") return;

  const events = findPipelineEvents();
  const labels = Array.from(new Set(events.map((event) => {
    const strong = Array.from(event.children).find((child) => child.tagName === "STRONG");
    return normalizeStatus(strong?.textContent ?? "event");
  }))).sort();

  const usedIndexes = new Set<number>();
  const colorByStatus = new Map<string, number>();

  labels.forEach((label) => {
    let colorIndex = hashStatus(label) % eventHues.length;
    while (usedIndexes.has(colorIndex) && usedIndexes.size < eventHues.length) {
      colorIndex = (colorIndex + 1) % eventHues.length;
    }
    usedIndexes.add(colorIndex);
    colorByStatus.set(label, eventHues[colorIndex]);
  });

  events.forEach((event) => {
    const strong = Array.from(event.children).find((child) => child.tagName === "STRONG");
    const status = normalizeStatus(strong?.textContent ?? "event");
    const hue = colorByStatus.get(status) ?? eventHues[hashStatus(status) % eventHues.length];

    event.dataset.pipelineEvent = status;
    event.style.setProperty("--pipeline-event-hue", String(hue));
  });
}

export default function PipelineEventColorEnhancer() {
  useEffect(() => {
    applyEventColors();

    const observer = new MutationObserver(() => applyEventColors());
    observer.observe(document.body, { childList: true, subtree: true });

    const handleNavigation = () => applyEventColors();
    window.addEventListener("popstate", handleNavigation);

    return () => {
      observer.disconnect();
      window.removeEventListener("popstate", handleNavigation);
    };
  }, []);

  return null;
}
