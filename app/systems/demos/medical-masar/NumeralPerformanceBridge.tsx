"use client";

import { useLayoutEffect } from "react";

const ARABIC_DIGITS = /[٠-٩]/g;
const LATIN_DIGITS = "0123456789";

function normalizeTextNode(node: Node) {
  if (node.nodeType !== Node.TEXT_NODE) return;
  const text = node.nodeValue;
  if (!text || !/[٠-٩]/.test(text)) return;
  node.nodeValue = text.replace(
    ARABIC_DIGITS,
    (digit) => LATIN_DIGITS[digit.charCodeAt(0) - 0x0660],
  );
}

function normalizeAddedNode(node: Node) {
  if (node.nodeType === Node.TEXT_NODE) {
    normalizeTextNode(node);
    return;
  }

  const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
  let textNode = walker.nextNode();
  while (textNode) {
    normalizeTextNode(textNode);
    textNode = walker.nextNode();
  }
}

export default function NumeralPerformanceBridge() {
  useLayoutEffect(() => {
    const OriginalNumberFormat = Intl.NumberFormat;
    const formatterCache = new Map<string, Intl.NumberFormat>();

    function CachedNumberFormat(
      locales?: Intl.LocalesArgument,
      options?: Intl.NumberFormatOptions,
    ): Intl.NumberFormat {
      const localeList = Array.isArray(locales) ? locales : locales ? [locales] : [];
      const normalizedOptions: Intl.NumberFormatOptions = {
        ...options,
        numberingSystem: "latn",
      };
      const key = JSON.stringify([localeList.map(String), normalizedOptions]);

      let formatter = formatterCache.get(key);
      if (!formatter) {
        formatter = new OriginalNumberFormat(locales, normalizedOptions);
        formatterCache.set(key, formatter);
      }
      return formatter;
    }

    Object.setPrototypeOf(CachedNumberFormat, OriginalNumberFormat);
    CachedNumberFormat.prototype = OriginalNumberFormat.prototype;
    (CachedNumberFormat as typeof Intl.NumberFormat).supportedLocalesOf =
      OriginalNumberFormat.supportedLocalesOf.bind(OriginalNumberFormat);
    (Intl as { NumberFormat: typeof Intl.NumberFormat }).NumberFormat =
      CachedNumberFormat as typeof Intl.NumberFormat;

    const main = document.querySelector<HTMLElement>('main[data-theme][lang]');
    if (!main) {
      return () => {
        (Intl as { NumberFormat: typeof Intl.NumberFormat }).NumberFormat = OriginalNumberFormat;
      };
    }

    let activeObserver: MutationObserver | null = null;
    let stopTimer = 0;

    const stopShortObserver = () => {
      activeObserver?.disconnect();
      activeObserver = null;
      if (stopTimer) window.clearTimeout(stopTimer);
      stopTimer = 0;
    };

    const armForArabicRender = () => {
      stopShortObserver();

      // Observe only the React mutations produced by this one language switch.
      // We normalize only the nodes React actually changes, rather than rescanning
      // the entire page. This keeps IDs such as SO-2026-041 unchanged with no lag.
      activeObserver = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          if (mutation.type === "characterData") {
            normalizeTextNode(mutation.target);
          } else if (mutation.type === "childList") {
            mutation.addedNodes.forEach(normalizeAddedNode);
          }
        }
      });

      activeObserver.observe(main, {
        subtree: true,
        childList: true,
        characterData: true,
      });

      stopTimer = window.setTimeout(stopShortObserver, 120);
    };

    const onClickCapture = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const button = target.closest("button");
      if (!button) return;
      if (button.textContent?.trim() === "عربي") armForArabicRender();
    };

    document.addEventListener("click", onClickCapture, true);

    return () => {
      document.removeEventListener("click", onClickCapture, true);
      stopShortObserver();
      (Intl as { NumberFormat: typeof Intl.NumberFormat }).NumberFormat = OriginalNumberFormat;
    };
  }, []);

  return null;
}
