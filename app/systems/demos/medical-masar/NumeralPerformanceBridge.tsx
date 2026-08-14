"use client";

import { useLayoutEffect } from "react";

const ARABIC_DIGITS = /[٠-٩]/g;
const LATIN_DIGITS = "0123456789";

function toLatinDigits(value: string) {
  ARABIC_DIGITS.lastIndex = 0;
  return value.replace(ARABIC_DIGITS, (digit) => LATIN_DIGITS[digit.charCodeAt(0) - 0x0660]);
}

function normalizeTextNode(node: Node) {
  if (node.nodeType !== Node.TEXT_NODE) return;
  const text = node.nodeValue;
  if (!text) return;
  ARABIC_DIGITS.lastIndex = 0;
  if (ARABIC_DIGITS.test(text)) node.nodeValue = toLatinDigits(text);
  ARABIC_DIGITS.lastIndex = 0;
}

function normalizeSubtree(root: Node) {
  if (root.nodeType === Node.TEXT_NODE) {
    normalizeTextNode(root);
    return;
  }

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    normalizeTextNode(node);
    node = walker.nextNode();
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
    (CachedNumberFormat as typeof Intl.NumberFormat).supportedLocalesOf = OriginalNumberFormat.supportedLocalesOf.bind(OriginalNumberFormat);
    (Intl as { NumberFormat: typeof Intl.NumberFormat }).NumberFormat = CachedNumberFormat as typeof Intl.NumberFormat;

    const main = document.querySelector<HTMLElement>('main[data-theme][lang]');
    if (!main) {
      return () => {
        (Intl as { NumberFormat: typeof Intl.NumberFormat }).NumberFormat = OriginalNumberFormat;
      };
    }

    // Normalize once immediately, then only touch nodes React actually changes.
    normalizeSubtree(main);

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === "characterData") {
          normalizeTextNode(mutation.target);
          continue;
        }

        if (mutation.type === "childList") {
          mutation.addedNodes.forEach(normalizeSubtree);
          continue;
        }

        if (mutation.type === "attributes" && mutation.target === main) {
          normalizeSubtree(main);
        }
      }
    });

    observer.observe(main, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["lang", "dir"],
    });

    return () => {
      observer.disconnect();
      (Intl as { NumberFormat: typeof Intl.NumberFormat }).NumberFormat = OriginalNumberFormat;
    };
  }, []);

  return null;
}
