"use client";

import { useLayoutEffect } from "react";

const ARABIC_DIGITS = /[٠-٩]/g;
const LATIN_DIGITS = "0123456789";

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
    (CachedNumberFormat as typeof Intl.NumberFormat).supportedLocalesOf = OriginalNumberFormat.supportedLocalesOf.bind(OriginalNumberFormat);
    (Intl as { NumberFormat: typeof Intl.NumberFormat }).NumberFormat = CachedNumberFormat as typeof Intl.NumberFormat;

    const main = document.querySelector<HTMLElement>('main[data-theme][lang]');
    if (!main) {
      return () => {
        (Intl as { NumberFormat: typeof Intl.NumberFormat }).NumberFormat = OriginalNumberFormat;
      };
    }

    let frame = 0;
    const normalizeArabicTextOnce = () => {
      frame = 0;
      if (main.getAttribute("lang") !== "ar") return;

      const walker = document.createTreeWalker(main, NodeFilter.SHOW_TEXT);
      let node = walker.nextNode();
      while (node) {
        const text = node.nodeValue;
        if (text && /[٠-٩]/.test(text)) {
          node.nodeValue = text.replace(ARABIC_DIGITS, (digit) => LATIN_DIGITS[digit.charCodeAt(0) - 0x0660]);
        }
        node = walker.nextNode();
      }
    };

    const scheduleNormalize = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(normalizeArabicTextOnce);
    };

    // Only react to the language switch itself. Watching subtree/text mutations
    // causes repeated rescans while React renders the Arabic view and creates lag.
    const observer = new MutationObserver(scheduleNormalize);
    observer.observe(main, {
      attributes: true,
      attributeFilter: ["lang"],
    });

    scheduleNormalize();

    return () => {
      observer.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
      (Intl as { NumberFormat: typeof Intl.NumberFormat }).NumberFormat = OriginalNumberFormat;
    };
  }, []);

  return null;
}
