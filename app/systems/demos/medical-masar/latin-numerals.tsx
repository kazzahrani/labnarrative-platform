"use client";

import { useEffect } from "react";

const arabicIndicDigits = /[٠-٩]/g;
const latinDigits = "0123456789";

function toLatinNumerals(value: string) {
  return value.replace(arabicIndicDigits, (digit) => latinDigits["٠١٢٣٤٥٦٧٨٩".indexOf(digit)] ?? digit);
}

function normalizeArabicView(root: Element) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();

  while (node) {
    const parent = node.parentElement;
    if (parent && parent.tagName !== "SCRIPT" && parent.tagName !== "STYLE") {
      const current = node.nodeValue ?? "";
      if (arabicIndicDigits.test(current)) {
        arabicIndicDigits.lastIndex = 0;
        node.nodeValue = toLatinNumerals(current);
      }
      arabicIndicDigits.lastIndex = 0;
    }
    node = walker.nextNode();
  }
}

export default function LatinNumerals() {
  useEffect(() => {
    const normalize = () => {
      document.querySelectorAll('main[lang="ar"]').forEach(normalizeArabicView);
    };

    normalize();

    const observer = new MutationObserver(normalize);
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["lang"],
    });

    return () => observer.disconnect();
  }, []);

  return null;
}
